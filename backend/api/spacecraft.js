// Spacecraft twins: CRUD, lifecycle status, real-orbit linking, on-demand screening, CDMs, event history.
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { query, pool } = require('../lib/db');
const { auth, canWrite } = require('../lib/auth');
const { handle, parse, HttpError } = require('../lib/http');
const { audit } = require('../lib/audit');
const O = require('../lib/orbit');
const T = require('../lib/tle');
const CDM = require('../lib/cdm');
const events = require('../lib/events');
const conj = require('../utils/conjunction');
const metrics = require('../lib/metrics');

const router = express.Router();
router.use(auth);

// Limit per team (organisation); MAX_SPACECRAFT_PER_USER is the older name of the same setting.
const MAX_PER_USER = Number(process.env.MAX_SPACECRAFT_PER_TEAM || process.env.MAX_SPACECRAFT_PER_USER) || 50;
const LIFECYCLE = ['designed', 'launched', 'operational', 'decommissioned'];
const TYPES = ['satellite', 'rocket', 'station', 'rover'];

const createSchema = z.object({
  name: z.string().trim().min(1).max(150),
  type: z.enum(TYPES),
  description: z.string().max(5000).optional().nullable(),
  components: z.array(z.any()).max(500).optional(),
  config: z.record(z.any()).optional(),
});
const updateSchema = createSchema.partial().extend({ status: z.enum([...LIFECYCLE, 'simulating', 'archived']).optional() });
const orbitSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('celestrak'), noradId: z.coerce.number().int().positive() }),
  z.object({ source: z.literal('manual'), line1: z.string().min(60).max(80), line2: z.string().min(60).max(80), name: z.string().max(100).optional() }),
  z.object({ source: z.literal('none') }),
]);

// Spacecraft are shared by everyone in the team (organisation).
const getOwned = async (id, orgId) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new HttpError(404, 'Spacecraft not found');
  const r = await query('SELECT * FROM spacecraft WHERE id=$1 AND organisation_id=$2 AND is_deleted=false', [id, orgId]);
  if (!r.rows.length) throw new HttpError(404, 'Spacecraft not found');
  return r.rows[0];
};

const fleetOf = async (orgId) => (await query(
  'SELECT id, name, type, config, user_id, organisation_id, norad_id, tle_line1, tle_line2 FROM spacecraft WHERE organisation_id=$1 AND is_deleted=false', [orgId]
)).rows;

router.get('/', handle(async (req, res) => {
  const r = await query('SELECT * FROM spacecraft WHERE organisation_id=$1 AND is_deleted=false ORDER BY created_at DESC', [req.user.orgId]);
  res.json({ data: r.rows, pagination: { total: r.rows.length, page: 1, limit: r.rows.length, totalPages: 1 } });
}));

router.post('/', canWrite, handle(async (req, res) => {
  const body = parse(createSchema, req.body);
  const count = await query('SELECT COUNT(*)::int AS n FROM spacecraft WHERE organisation_id=$1 AND is_deleted=false', [req.user.orgId]);
  if (count.rows[0].n >= MAX_PER_USER) throw new HttpError(429, `Maximum ${MAX_PER_USER} spacecraft per account`);
  const id = uuidv4();
  const r = await query(
    `INSERT INTO spacecraft (id,user_id,organisation_id,name,type,description,components,config,status,is_deleted,created_at)
     VALUES ($1,$2,$8,$3,$4,$5,$6,$7,'designed',false,NOW()) RETURNING *`,
    [id, req.user.id, body.name, body.type, body.description || null, JSON.stringify(body.components || []), JSON.stringify(body.config || {}), req.user.orgId]
  );
  await audit(req, 'spacecraft_created', 'spacecraft', id, { name: body.name, type: body.type });
  res.status(201).json(r.rows[0]);
}));

router.get('/:id', handle(async (req, res) => {
  res.json(await getOwned(req.params.id, req.user.orgId));
}));

router.put('/:id', canWrite, handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.orgId);
  const b = parse(updateSchema, req.body);
  const r = await query(
    `UPDATE spacecraft SET name=$1, type=$2, description=$3, components=$4, config=$5, status=$6, updated_at=NOW()
     WHERE id=$7 AND organisation_id=$8 RETURNING *`,
    [b.name ?? sc.name, b.type ?? sc.type, b.description !== undefined ? b.description : sc.description,
      JSON.stringify(b.components ?? sc.components ?? []), JSON.stringify(b.config ?? sc.config ?? {}),
      b.status ?? sc.status, sc.id, req.user.orgId]
  );
  await audit(req, 'spacecraft_updated', 'spacecraft', sc.id, {});
  res.json(r.rows[0]);
}));

router.delete('/:id', canWrite, handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.orgId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE spacecraft SET is_deleted=true, deleted_at=NOW(), status='archived' WHERE id=$1", [sc.id]);
    await client.query('UPDATE missions SET spacecraft_id=NULL WHERE spacecraft_id=$1', [sc.id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await audit(req, 'spacecraft_deleted', 'spacecraft', sc.id, { name: sc.name });
  res.json({ message: 'Deleted', id: sc.id });
}));

router.put('/:id/status', canWrite, handle(async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(LIFECYCLE) }), req.body);
  const sc = await getOwned(req.params.id, req.user.orgId);
  const r = await query('UPDATE spacecraft SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [status, sc.id]);
  await audit(req, 'spacecraft_status_changed', 'spacecraft', sc.id, { from: sc.status, to: status });
  res.json(r.rows[0]);
}));

// Link a twin to a real satellite (NORAD ID via CelesTrak) or to an operator-supplied TLE.
router.put('/:id/orbit', canWrite, handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.orgId);
  const b = parse(orbitSchema, req.body);
  if (b.source === 'none') {
    const r = await query(
      'UPDATE spacecraft SET norad_id=NULL, tle_line1=NULL, tle_line2=NULL, tle_epoch=NULL, tle_source=NULL, tle_updated_at=NULL, updated_at=NOW() WHERE id=$1 RETURNING *',
      [sc.id]
    );
    await audit(req, 'orbit_unlinked', 'spacecraft', sc.id, {});
    return res.json(r.rows[0]);
  }

  let tle;
  try {
    if (b.source === 'celestrak') {
      tle = await T.byNorad(b.noradId, conj.findInCatalog);
    } else {
      tle = { ...T.validate(b.line1, b.line2), name: b.name || null, source: 'manual' };
    }
  } catch (e) {
    throw new HttpError(422, e.message);
  }

  const el = O.describe({ kind: 'tle', l1: tle.l1, l2: tle.l2 });
  const cfg = {
    ...O.parseConfig(sc.config),
    altitude: Number(el.altitudeKm.toFixed(1)),
    inclination: Number(el.inclinationDeg.toFixed(3)),
    raan: Number(el.raanDeg.toFixed(3)),
  };
  const r = await query(
    `UPDATE spacecraft SET norad_id=$1, tle_line1=$2, tle_line2=$3, tle_epoch=$4, tle_source=$5, tle_updated_at=NOW(),
       config=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
    [tle.norad, tle.l1, tle.l2, tle.epoch, tle.source, JSON.stringify(cfg), sc.id]
  );
  await audit(req, 'orbit_linked', 'spacecraft', sc.id, { source: tle.source, norad: tle.norad });
  res.json({ ...r.rows[0], orbit: { ...el, catalogName: tle.name } });
}));

// Add several real satellites at once by NORAD ID (e.g. a validation set). Skips IDs already in the fleet.
router.post('/bulk-norad', canWrite, handle(async (req, res) => {
  const b = parse(z.object({
    noradIds: z.array(z.coerce.number().int().positive().max(999999999)).min(1).max(25),
    status: z.enum(['designed', 'launched', 'operational']).default('operational'),
    muteAlerts: z.boolean().default(true),
  }), req.body);
  const ids = [...new Set(b.noradIds)];
  const existing = new Set((await query(
    'SELECT norad_id FROM spacecraft WHERE organisation_id=$1 AND is_deleted=false AND norad_id IS NOT NULL', [req.user.orgId]
  )).rows.map((r) => Number(r.norad_id)));
  const count = (await query('SELECT COUNT(*)::int AS n FROM spacecraft WHERE organisation_id=$1 AND is_deleted=false', [req.user.orgId])).rows[0].n;
  try { await conj.loadCatalog(); } catch (e) { /* fall back to per-object CelesTrak lookups */ }

  const results = [];
  let room = MAX_PER_USER - count;
  for (const norad of ids) {
    if (existing.has(norad)) { results.push({ norad, status: 'exists' }); continue; }
    if (room <= 0) { results.push({ norad, status: 'error', error: `Maximum ${MAX_PER_USER} spacecraft per account` }); continue; }
    let tle;
    try { tle = await T.byNorad(norad, conj.findInCatalog); } catch (e) { results.push({ norad, status: 'error', error: e.message }); continue; }
    const el = O.describe({ kind: 'tle', l1: tle.l1, l2: tle.l2 });
    const name = String(tle.name && !/^NORAD /.test(tle.name) ? tle.name : `NORAD ${norad}`).slice(0, 150);
    const cfg = { altitude: Number(el.altitudeKm.toFixed(1)), inclination: Number(el.inclinationDeg.toFixed(3)), raan: Number(el.raanDeg.toFixed(3)) };
    const r = await query(
      `INSERT INTO spacecraft (id,user_id,name,type,description,components,config,status,is_deleted,created_at,
         norad_id,tle_line1,tle_line2,tle_epoch,tle_source,tle_updated_at,alerts_muted,organisation_id)
       VALUES ($1,$2,$3,'satellite',$4,'[]',$5,$6,false,NOW(),$7,$8,$9,$10,$11,NOW(),$12,$13) RETURNING id, name, norad_id`,
      [uuidv4(), req.user.id, name, 'Added by NORAD ID for tracking and validation', JSON.stringify(cfg), b.status,
        tle.norad, tle.l1, tle.l2, tle.epoch, tle.source, b.muteAlerts, req.user.orgId]
    );
    room--;
    existing.add(norad);
    results.push({ norad, status: 'added', id: r.rows[0].id, name: r.rows[0].name, altitudeKm: cfg.altitude });
  }
  await audit(req, 'spacecraft_bulk_added', 'spacecraft', null, { added: results.filter((r) => r.status === 'added').length });
  res.status(201).json({ results });
}));

// Turn conjunction alerts on or off for one twin (it is still screened either way).
router.put('/:id/alerts', canWrite, handle(async (req, res) => {
  const { muted } = parse(z.object({ muted: z.boolean() }), req.body);
  const sc = await getOwned(req.params.id, req.user.orgId);
  const r = await query('UPDATE spacecraft SET alerts_muted=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [muted, sc.id]);
  await audit(req, muted ? 'alerts_muted' : 'alerts_unmuted', 'spacecraft', sc.id, {});
  res.json(r.rows[0]);
}));

// Run a screening now, store events and send alerts for new/escalated risks.
router.post('/:id/screen', canWrite, handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.orgId);
  const det = await conj.screenDetailed(sc, await fleetOf(req.user.orgId), { force: true });
  metrics.screenings.inc({ trigger: 'manual' });
  const escalated = await events.persistScreening(sc, det.events);
  const alerts = await events.alertFor(sc, escalated);
  res.json({ ...det.report, alertsSent: alerts, newOrEscalated: escalated.length });
}));

router.post('/:id/cdm', canWrite, handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.orgId);
  const { content } = parse(z.object({ content: z.string().min(10).max(1_000_000) }), req.body);
  let cdms;
  try { cdms = CDM.parse(content); } catch (e) { throw new HttpError(422, `Could not read CDM: ${e.message}`); }
  const result = await events.ingestCdms(sc, cdms, 'upload');
  await audit(req, 'cdm_uploaded', 'spacecraft', sc.id, { count: cdms.length });
  res.status(201).json({ imported: result.rows.filter((r) => r.isNew).length, duplicates: result.rows.filter((r) => !r.isNew).length, alerts: result.alerts, cdms: result.rows });
}));

// ---- operator ephemeris (CCSDS OEM) ----
const OEM = require('../lib/oem');
const ephemerisStore = require('../lib/ephemeris');

const ephSummary = (r) => ({
  id: r.id, objectName: r.object_name, objectId: r.object_id, sourceFrame: r.source_frame, start: r.start_time, stop: r.stop_time,
  points: r.points, covariance: r.cov_count != null ? r.cov_count : undefined, active: r.is_active, createdAt: r.created_at, uploadedBy: r.uploaded_by_name,
});

// How far the public TLE is from the operator's ephemeris (RTN, km) at a few times inside the span.
const tleVsEphemeris = (sc, eph) => {
  if (!sc.tle_line1) return null;
  const tle = O.stateFn({ kind: 'tle', l1: sc.tle_line1, l2: sc.tle_line2 });
  const f = OEM.interpolator(eph);
  const n = eph.t.length;
  const samples = [0, 0.25, 0.5, 0.75, 1].map((q) => eph.t[Math.min(n - 1, Math.round(q * (n - 1)))]);
  const rows = samples.map((ms) => {
    const a = f(ms); const b = tle(ms);
    if (!a || !b) return null;
    const { R, T, N } = O.rtnBasis(a.r, a.v);
    const d = O.sub(b.r, a.r);
    return { at: new Date(ms).toISOString(), totalKm: O.norm(d), radialKm: O.dot(d, R), alongTrackKm: O.dot(d, T), crossTrackKm: O.dot(d, N) };
  }).filter(Boolean);
  if (!rows.length) return null;
  return { samples: rows, maxKm: Math.max(...rows.map((x) => x.totalKm)) };
};

router.post('/:id/ephemeris', canWrite, handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.orgId);
  const { content } = parse(z.object({ content: z.string().min(50).max(12_000_000), filename: z.string().max(200).optional() }), req.body);
  let eph;
  try { eph = OEM.parse(content); } catch (e) { throw new HttpError(422, `Could not read the OEM: ${e.message}`); }
  if (eph.t[eph.t.length - 1] < Date.now() - 86400000) throw new HttpError(422, 'This ephemeris ended more than a day ago; upload a current prediction');
  const r = await query(
    `INSERT INTO ephemerides (spacecraft_id, uploaded_by, object_name, object_id, source_frame, start_time, stop_time, points, states, covariance)
     VALUES ($1,$2,$3,$4,$5,(to_timestamp($6/1000.0) AT TIME ZONE 'UTC'),(to_timestamp($7/1000.0) AT TIME ZONE 'UTC'),$8,$9,$10)
     RETURNING id, object_name, object_id, source_frame, start_time, stop_time, points, is_active, created_at`,
    [sc.id, req.user.id, eph.objectName, eph.objectId, eph.sourceFrame, eph.t[0], eph.t[eph.t.length - 1], eph.t.length,
      JSON.stringify({ t: eph.t, r: eph.r, v: eph.v }), eph.cov.length ? JSON.stringify(eph.cov) : null]
  );
  // Older uploads stay in the history but stop being used.
  await query('UPDATE ephemerides SET is_active=false WHERE spacecraft_id=$1 AND id<>$2 AND is_active', [sc.id, r.rows[0].id]);
  await audit(req, 'ephemeris_uploaded', 'spacecraft', sc.id, { points: eph.t.length, frame: eph.sourceFrame, covariance: eph.cov.length });
  res.status(201).json({
    ...ephSummary({ ...r.rows[0], cov_count: eph.cov.length }),
    stepSec: eph.stepSec, timeSystem: eph.timeSystem,
    sigmaKm: OEM.sigmaAt(eph, eph.t[0]),
    tleComparison: tleVsEphemeris(sc, eph),
  });
}));

router.get('/:id/ephemeris', handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.orgId);
  const r = await query(
    `SELECT e.id, e.object_name, e.object_id, e.source_frame, e.start_time, e.stop_time, e.points, e.is_active, e.created_at,
            COALESCE(jsonb_array_length(e.covariance), 0) AS cov_count, u.name AS uploaded_by_name
       FROM ephemerides e LEFT JOIN users u ON u.id = e.uploaded_by WHERE e.spacecraft_id=$1 ORDER BY e.created_at DESC LIMIT 20`, [sc.id]
  );
  const active = (await ephemerisStore.activeFor([sc.id])).get(String(sc.id)) || null;
  res.json({ data: r.rows.map(ephSummary), inUse: active });
}));

router.delete('/:id/ephemeris/:eid', canWrite, handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.orgId);
  const eid = parse(z.string().uuid(), req.params.eid);
  const r = await query('UPDATE ephemerides SET is_active=false WHERE id=$1 AND spacecraft_id=$2 RETURNING id', [eid, sc.id]);
  if (!r.rows.length) throw new HttpError(404, 'Ephemeris not found');
  await audit(req, 'ephemeris_removed', 'spacecraft', sc.id, { ephemeris: eid });
  res.json({ id: eid, active: false });
}));

router.get('/:id/cdms', handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.orgId);
  const r = await query('SELECT * FROM cdms WHERE spacecraft_id=$1 ORDER BY tca DESC LIMIT 100', [sc.id]);
  res.json({ data: r.rows });
}));

router.get('/:id/events', handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.orgId);
  const r = await query(
    "SELECT * FROM conjunction_events WHERE spacecraft_id=$1 AND (severity <> 'nominal' OR source='cdm') ORDER BY tca DESC LIMIT 200", [sc.id]
  );
  res.json({ data: r.rows, lastScreenedAt: sc.last_screened_at });
}));

module.exports = { router, getOwned, fleetOf };
