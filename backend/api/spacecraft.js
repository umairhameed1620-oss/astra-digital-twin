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

const MAX_PER_USER = Number(process.env.MAX_SPACECRAFT_PER_USER) || 50;
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

const getOwned = async (id, userId) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new HttpError(404, 'Spacecraft not found');
  const r = await query('SELECT * FROM spacecraft WHERE id=$1 AND user_id=$2 AND is_deleted=false', [id, userId]);
  if (!r.rows.length) throw new HttpError(404, 'Spacecraft not found');
  return r.rows[0];
};

const fleetOf = async (userId) => (await query(
  'SELECT id, name, type, config, user_id, norad_id, tle_line1, tle_line2 FROM spacecraft WHERE user_id=$1 AND is_deleted=false', [userId]
)).rows;

router.get('/', handle(async (req, res) => {
  const r = await query('SELECT * FROM spacecraft WHERE user_id=$1 AND is_deleted=false ORDER BY created_at DESC', [req.user.id]);
  res.json({ data: r.rows, pagination: { total: r.rows.length, page: 1, limit: r.rows.length, totalPages: 1 } });
}));

router.post('/', canWrite, handle(async (req, res) => {
  const body = parse(createSchema, req.body);
  const count = await query('SELECT COUNT(*)::int AS n FROM spacecraft WHERE user_id=$1 AND is_deleted=false', [req.user.id]);
  if (count.rows[0].n >= MAX_PER_USER) throw new HttpError(429, `Maximum ${MAX_PER_USER} spacecraft per account`);
  const id = uuidv4();
  const r = await query(
    `INSERT INTO spacecraft (id,user_id,name,type,description,components,config,status,is_deleted,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'designed',false,NOW()) RETURNING *`,
    [id, req.user.id, body.name, body.type, body.description || null, JSON.stringify(body.components || []), JSON.stringify(body.config || {})]
  );
  await audit(req, 'spacecraft_created', 'spacecraft', id, { name: body.name, type: body.type });
  res.status(201).json(r.rows[0]);
}));

router.get('/:id', handle(async (req, res) => {
  res.json(await getOwned(req.params.id, req.user.id));
}));

router.put('/:id', canWrite, handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.id);
  const b = parse(updateSchema, req.body);
  const r = await query(
    `UPDATE spacecraft SET name=$1, type=$2, description=$3, components=$4, config=$5, status=$6, updated_at=NOW()
     WHERE id=$7 AND user_id=$8 RETURNING *`,
    [b.name ?? sc.name, b.type ?? sc.type, b.description !== undefined ? b.description : sc.description,
      JSON.stringify(b.components ?? sc.components ?? []), JSON.stringify(b.config ?? sc.config ?? {}),
      b.status ?? sc.status, sc.id, req.user.id]
  );
  await audit(req, 'spacecraft_updated', 'spacecraft', sc.id, {});
  res.json(r.rows[0]);
}));

router.delete('/:id', canWrite, handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.id);
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
  const sc = await getOwned(req.params.id, req.user.id);
  const r = await query('UPDATE spacecraft SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [status, sc.id]);
  await audit(req, 'spacecraft_status_changed', 'spacecraft', sc.id, { from: sc.status, to: status });
  res.json(r.rows[0]);
}));

// Link a twin to a real satellite (NORAD ID via CelesTrak) or to an operator-supplied TLE.
router.put('/:id/orbit', canWrite, handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.id);
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
    'SELECT norad_id FROM spacecraft WHERE user_id=$1 AND is_deleted=false AND norad_id IS NOT NULL', [req.user.id]
  )).rows.map((r) => Number(r.norad_id)));
  const count = (await query('SELECT COUNT(*)::int AS n FROM spacecraft WHERE user_id=$1 AND is_deleted=false', [req.user.id])).rows[0].n;
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
         norad_id,tle_line1,tle_line2,tle_epoch,tle_source,tle_updated_at,alerts_muted)
       VALUES ($1,$2,$3,'satellite',$4,'[]',$5,$6,false,NOW(),$7,$8,$9,$10,$11,NOW(),$12) RETURNING id, name, norad_id`,
      [uuidv4(), req.user.id, name, 'Added by NORAD ID for tracking and validation', JSON.stringify(cfg), b.status,
        tle.norad, tle.l1, tle.l2, tle.epoch, tle.source, b.muteAlerts]
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
  const sc = await getOwned(req.params.id, req.user.id);
  const r = await query('UPDATE spacecraft SET alerts_muted=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [muted, sc.id]);
  await audit(req, muted ? 'alerts_muted' : 'alerts_unmuted', 'spacecraft', sc.id, {});
  res.json(r.rows[0]);
}));

// Run a screening now, store events and send alerts for new/escalated risks.
router.post('/:id/screen', canWrite, handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.id);
  const det = await conj.screenDetailed(sc, await fleetOf(req.user.id), { force: true });
  metrics.screenings.inc({ trigger: 'manual' });
  const escalated = await events.persistScreening(sc, det.events);
  const alerts = await events.alertFor(sc, escalated);
  res.json({ ...det.report, alertsSent: alerts, newOrEscalated: escalated.length });
}));

router.post('/:id/cdm', canWrite, handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.id);
  const { content } = parse(z.object({ content: z.string().min(10).max(1_000_000) }), req.body);
  let cdms;
  try { cdms = CDM.parse(content); } catch (e) { throw new HttpError(422, `Could not read CDM: ${e.message}`); }
  const result = await events.ingestCdms(sc, cdms, 'upload');
  await audit(req, 'cdm_uploaded', 'spacecraft', sc.id, { count: cdms.length });
  res.status(201).json({ imported: result.rows.filter((r) => r.isNew).length, duplicates: result.rows.filter((r) => !r.isNew).length, alerts: result.alerts, cdms: result.rows });
}));

router.get('/:id/cdms', handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.id);
  const r = await query('SELECT * FROM cdms WHERE spacecraft_id=$1 ORDER BY tca DESC LIMIT 100', [sc.id]);
  res.json({ data: r.rows });
}));

router.get('/:id/events', handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.id);
  const r = await query(
    "SELECT * FROM conjunction_events WHERE spacecraft_id=$1 AND (severity <> 'nominal' OR source='cdm') ORDER BY tca DESC LIMIT 200", [sc.id]
  );
  res.json({ data: r.rows, lastScreenedAt: sc.last_screened_at });
}));

module.exports = { router, getOwned, fleetOf };
