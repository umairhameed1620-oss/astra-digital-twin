// Validation: compare ASTRA's own prediction for a conjunction with the CDM issued for the same pair.
// For every stored CDM (Space-Track public CDMs or uploads) on a NORAD-linked twin, ASTRA propagates
// both objects from the latest public TLEs, finds its own time of closest approach (TCA) near the
// CDM's TCA, and records the differences in TCA, miss distance, Pc and severity.
const { query } = require('./db');
const O = require('./orbit');
const PC = require('./pc');
const T = require('./tle');
const log = require('./log');
const spacetrack = require('./spacetrack');
const CDM = require('./cdm');
const events = require('./events');
const conj = require('../utils/conjunction');

const SEARCH_MIN = 45;      // search +/- this many minutes around the CDM TCA
const STEP_SEC = 10;
const PHI = (Math.sqrt(5) - 1) / 2;
const PC_FLOOR = 1e-12;     // Pc below this is treated as "effectively zero" when comparing orders of magnitude
const REPORT_KM = Number(process.env.CONJ_REPORT_KM) || 10;
const LOOKBACK_DAYS = Number(process.env.VALIDATION_LOOKBACK_DAYS) || 14;
const MAX_ROWS = 400;

const goldenMin = (f, lo, hi) => {
  let a = lo, b = hi;
  let c = b - PHI * (b - a), d = a + PHI * (b - a);
  let fc = f(c), fd = f(d);
  for (let k = 0; k < 50; k++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - PHI * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + PHI * (b - a); fd = f(d); }
  }
  return fc < fd ? { t: c, d: fc } : { t: d, d: fd };
};

/**
 * ASTRA's closest approach between two TLE objects near `aroundMs`.
 * Returns { tcaMs, missKm, relSpeedKms, twin:{r,v}, obj:{r,v} } or null if propagation fails.
 */
const closestApproach = (twinTle, objTle, aroundMs, searchMin = SEARCH_MIN) => {
  const f1 = O.stateFn({ kind: 'tle', l1: twinTle.l1, l2: twinTle.l2 });
  const f2 = O.stateFn({ kind: 'tle', l1: objTle.l1, l2: objTle.l2 });
  const dist = (ms) => {
    const a = f1(ms); const b = f2(ms);
    return a && b ? O.norm(O.sub(b.r, a.r)) : Infinity;
  };
  const lo = aroundMs - searchMin * 60000;
  const n = Math.floor((2 * searchMin * 60) / STEP_SEC);
  let best = null;
  let prev = dist(lo);
  let cur = dist(lo + STEP_SEC * 1000);
  for (let i = 1; i < n; i++) {
    const t = lo + i * STEP_SEC * 1000;
    const next = dist(t + STEP_SEC * 1000);
    if (cur <= prev && cur <= next && Number.isFinite(cur)) {
      const m = goldenMin(dist, t - STEP_SEC * 1000, t + STEP_SEC * 1000);
      // Prefer the local minimum nearest the CDM TCA when two passes are similarly close.
      const score = m.d + Math.abs(m.t - aroundMs) / 3.6e6; // 1 km penalty per hour away
      if (!best || score < best.score) best = { ...m, score };
    }
    prev = cur; cur = next;
  }
  if (!best || !Number.isFinite(best.d)) return null;
  const a = f1(best.t); const b = f2(best.t);
  return { tcaMs: best.t, missKm: best.d, relSpeedKms: O.norm(O.sub(b.v, a.v)), twin: a, obj: b };
};

const tleAgeDays = (tle, atMs) => (atMs - O.tleEpochMs(O.satrec(tle.l1, tle.l2))) / 86400000;

/**
 * Compare ASTRA with one CDM. cdm: { tcaMs, missKm, pc } (pc may be null).
 * Pure function apart from SGP4; used by the run and by unit tests.
 */
const compare = (twinTle, objTle, cdm) => {
  const ca = closestApproach(twinTle, objTle, cdm.tcaMs);
  if (!ca) return { status: 'propagation_failed' };
  const ageTwin = tleAgeDays(twinTle, ca.tcaMs);
  const ageObj = tleAgeDays(objTle, ca.tcaMs);
  const est = PC.estimatePc(ca.twin, ca.obj, ageTwin, ageObj);
  const astraSev = conj.classify(est.pc, ca.missKm);
  const cdmSev = cdm.pc != null && cdm.missKm != null ? conj.classify(cdm.pc, cdm.missKm) : null;
  const lr = cdm.pc != null ? Math.log10(Math.max(est.pc, PC_FLOOR)) - Math.log10(Math.max(cdm.pc, PC_FLOOR)) : null;
  return {
    status: 'compared',
    astraTca: new Date(ca.tcaMs).toISOString(),
    astraMissKm: ca.missKm,
    astraPc: est.pc,
    astraSeverity: astraSev,
    relSpeedKms: ca.relSpeedKms,
    dTcaSec: (ca.tcaMs - cdm.tcaMs) / 1000,
    dMissKm: cdm.missKm != null ? ca.missKm - cdm.missKm : null,
    pcLog10Ratio: lr,
    cdmSeverity: cdmSev,
    severityAgrees: cdmSev ? cdmSev === astraSev : null,
    flagged: ca.missKm <= REPORT_KM,
    twinTleAgeDays: ageTwin,
    objTleAgeDays: ageObj,
  };
};

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const share = (xs, f) => (xs.length ? xs.filter(f).length / xs.length : null);

/** Summary statistics over comparison rows. */
const summarise = (rows) => {
  const ok = rows.filter((r) => r.status === 'compared');
  const dT = ok.map((r) => Math.abs(r.dTcaSec));
  const dM = ok.filter((r) => r.dMissKm != null).map((r) => Math.abs(r.dMissKm));
  const withPc = ok.filter((r) => r.pcLog10Ratio != null);
  const withSev = ok.filter((r) => r.severityAgrees != null);
  const highCdm = ok.filter((r) => r.cdmSeverity && r.cdmSeverity !== 'nominal');
  return {
    cdms: rows.length,
    compared: ok.length,
    skipped: rows.length - ok.length,
    satellites: new Set(rows.map((r) => r.spacecraftId)).size,
    flaggedRate: share(ok, (r) => r.flagged),
    medianAbsDTcaSec: median(dT),
    p90AbsDTcaSec: pct(dT, 90),
    medianAbsDMissKm: median(dM),
    p90AbsDMissKm: pct(dM, 90),
    pcWithin1OrderRate: share(withPc, (r) => Math.abs(r.pcLog10Ratio) <= 1),
    severityAgreementRate: share(withSev, (r) => r.severityAgrees),
    highRiskCdms: highCdm.length,
    highRiskCaughtRate: share(highCdm, (r) => r.astraSeverity !== 'nominal'),
    reportThresholdKm: REPORT_KM,
  };
};

const lastFetch = new Map(); // userId -> ms

// Pull the latest public CDMs for these twins from Space-Track (at most once an hour per user).
const refreshCdms = async (userId, twins) => {
  if (!spacetrack.configured() || !twins.length) return { fetched: false, reason: spacetrack.configured() ? 'no satellites' : 'Space-Track not configured' };
  if (Date.now() - (lastFetch.get(userId) || 0) < 3600000) return { fetched: false, reason: 'fetched within the last hour' };
  lastFetch.set(userId, Date.now());
  const rows = await spacetrack.upcomingCdms(twins.map((t) => t.norad_id));
  const cdms = rows.map((r) => CDM.parse(JSON.stringify(r))[0]);
  let stored = 0;
  for (const sc of twins) {
    const mine = cdms.filter((c) => c.obj.some((o) => String(Number(o.designator)) === String(sc.norad_id)));
    if (mine.length) { const r = await events.ingestCdms(sc, mine, 'spacetrack'); stored += r.rows.filter((x) => x.isNew).length; }
  }
  return { fetched: true, received: cdms.length, stored };
};

const objectTle = async (norad, cache) => {
  const k = String(Number(norad));
  if (cache.has(k)) return cache.get(k);
  let t = null;
  try { t = await T.byNorad(Number(k), conj.findInCatalog); } catch (e) { t = { error: e.message }; }
  cache.set(k, t);
  return t;
};

/**
 * Run a validation for a user's NORAD-linked twins (optionally a subset).
 * Returns the stored run { id, created_at, summary, rows }.
 */
const run = async (userId, { spacecraftIds = null, trigger = 'manual' } = {}) => {
  const params = [userId];
  let filter = '';
  if (spacecraftIds && spacecraftIds.length) { params.push(spacecraftIds); filter = 'AND id = ANY($2::uuid[])'; }
  const twins = (await query(
    `SELECT * FROM spacecraft WHERE user_id=$1 AND is_deleted=false AND norad_id IS NOT NULL AND tle_line1 IS NOT NULL ${filter} ORDER BY name`, params
  )).rows;

  let cdmRefresh;
  try { await conj.loadCatalog(); } catch (e) { log.warn('Validation: catalogue unavailable, using cached / per-object TLEs', { error: e.message }); }
  try { cdmRefresh = await refreshCdms(userId, twins); } catch (e) { cdmRefresh = { fetched: false, reason: e.message }; }

  const tleCache = new Map();
  const rows = [];
  for (const sc of twins) {
    const cdms = (await query(
      `SELECT * FROM cdms WHERE spacecraft_id=$1 AND tca > NOW() - make_interval(days => $2) ORDER BY tca DESC LIMIT 100`, [sc.id, LOOKBACK_DAYS]
    )).rows;
    const twinTle = { l1: sc.tle_line1, l2: sc.tle_line2 };
    for (const c of cdms) {
      if (rows.length >= MAX_ROWS) break;
      const tcaMs = new Date(c.tca).getTime(); // TIMESTAMP columns are UTC (process TZ=UTC)
      const cdmPc = c.pc_foster != null ? c.pc_foster : c.pc_reported;
      const base = {
        spacecraftId: sc.id, spacecraft: sc.name, norad: sc.norad_id, cdmId: c.cdm_id, cdmSource: c.source,
        objectId: c.object_id, objectName: c.object_name, cdmTca: new Date(tcaMs).toISOString(),
        cdmMissKm: c.miss_km, cdmPc, upcoming: tcaMs > Date.now(),
      };
      if (!c.object_id || !/^\d+$/.test(String(c.object_id).trim())) { rows.push({ ...base, status: 'object_unknown', note: 'CDM has no NORAD ID for the other object' }); continue; }
      const obj = await objectTle(c.object_id, tleCache);
      if (!obj || obj.error) { rows.push({ ...base, status: 'object_not_found', note: obj && obj.error }); continue; }
      try {
        rows.push({ ...base, ...compare(twinTle, obj, { tcaMs, missKm: c.miss_km, pc: cdmPc }) });
      } catch (e) {
        rows.push({ ...base, status: 'propagation_failed', note: e.message });
      }
    }
  }

  const summary = {
    ...summarise(rows),
    satellitesChecked: twins.length,
    lookbackDays: LOOKBACK_DAYS,
    cdmRefresh,
    method: 'ASTRA: SGP4 on the latest public TLEs, 10 s search + golden-section refinement within ±45 min of the CDM TCA; Pc by Foster 2D with TLE-age covariance. Reference: the CDM (CSpOC high-accuracy catalogue for Space-Track CDMs).',
  };
  const r = await query(
    'INSERT INTO validation_runs (user_id, trigger, summary, rows) VALUES ($1,$2,$3,$4) RETURNING id, trigger, created_at, summary, rows',
    [userId, trigger, JSON.stringify(summary), JSON.stringify(rows)]
  );
  return r.rows[0];
};

/** Cumulative summary across all of a user's runs (latest comparison per CDM). */
const cumulative = async (userId) => {
  const runs = (await query('SELECT rows FROM validation_runs WHERE user_id=$1 ORDER BY created_at ASC', [userId])).rows;
  const byCdm = new Map();
  for (const r of runs) for (const row of r.rows || []) byCdm.set(`${row.spacecraftId}:${row.cdmId}`, row);
  const rows = [...byCdm.values()];
  return { ...summarise(rows), runs: runs.length };
};

const csv = (rows) => {
  const cols = ['spacecraft', 'norad', 'objectName', 'objectId', 'cdmId', 'cdmSource', 'status', 'cdmTca', 'astraTca', 'dTcaSec',
    'cdmMissKm', 'astraMissKm', 'dMissKm', 'cdmPc', 'astraPc', 'pcLog10Ratio', 'cdmSeverity', 'astraSeverity', 'severityAgrees',
    'flagged', 'twinTleAgeDays', 'objTleAgeDays', 'note'];
  const esc = (v) => {
    if (v == null) return '';
    let s = typeof v === 'number' ? String(Number(v.toPrecision(6))) : String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = `'${s}`; // spreadsheet formula injection guard
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
};

module.exports = { run, cumulative, compare, closestApproach, summarise, csv, refreshCdms };
