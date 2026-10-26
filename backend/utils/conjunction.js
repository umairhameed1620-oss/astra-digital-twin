// ASTRA conjunction screening.
// Catalogue: CelesTrak GP data (TLE). Propagation: SGP4 (satellite.js) in a worker thread.
// Twins linked to a real satellite (NORAD ID / TLE) are propagated with SGP4; unlinked twins use
// the idealised circular orbit from their design config (same model the 3D visualiser draws).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const O = require('../lib/orbit');
const PC = require('../lib/pc');
const { parseTle } = require('../lib/tle');
const { getText } = require('../lib/net');

const GROUPS = [
  'active',              // all active payloads (Starlink, OneWeb, ISS ...)
  'cosmos-1408-debris',  // 2021 Russian ASAT test debris
  'fengyun-1c-debris',   // 2007 Chinese ASAT test debris
  'iridium-33-debris',   // 2009 Iridium-Cosmos collision
  'cosmos-2251-debris',
];

const CATALOG_TTL_MS = 6 * 3600 * 1000;   // CelesTrak asks users not to re-download more than every couple of hours
const RESULT_TTL_MS = 30 * 60 * 1000;
const SHELL_PAD_KM = 30;
const REPORT_KM = Number(process.env.CONJ_REPORT_KM) || 10;
const WINDOW_HOURS = Number(process.env.CONJ_WINDOW_HOURS) || 24;
const STEP_SEC = Number(process.env.CONJ_STEP_SEC) || 30;
const PC_CRITICAL = Number(process.env.PC_CRITICAL) || 1e-4;
const PC_WARNING = Number(process.env.PC_WARNING) || 1e-6;
// Persist the catalogue on the backend_logs volume so it survives container rebuilds
// (CelesTrak blocks clients that re-download the same data too often).
const cacheDir = () => {
  const candidates = [process.env.CATALOG_CACHE_DIR, path.join(__dirname, '..', 'logs'), os.tmpdir()].filter(Boolean);
  for (const d of candidates) {
    try { fs.mkdirSync(d, { recursive: true }); fs.accessSync(d, fs.constants.W_OK); return d; } catch (e) { /* try next */ }
  }
  return os.tmpdir();
};
const CACHE_FILE = path.join(cacheDir(), 'celestrak-catalog.json');

let catalog = null;
let catalogIndex = null;
let catalogPromise = null;
const results = new Map();
const inflight = new Map();

const indexCatalog = (c) => {
  catalogIndex = new Map(c.objects.map((o) => [String(Number(o.norad)), o]));
};

const withShell = (t) => {
  const ecc = parseFloat(`0.${t.l2.slice(26, 33).trim()}`);
  const revPerDay = parseFloat(t.l2.slice(52, 63));
  if (!revPerDay || Number.isNaN(ecc)) return null;
  const n = (revPerDay * 2 * Math.PI) / 86400;
  const a = Math.cbrt(O.MU / (n * n));
  return { ...t, rp: a * (1 - ecc), ra: a * (1 + ecc) };
};

const readDiskCache = () => {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (e) { return null; }
};

const loadCatalog = async () => {
  if (catalog && Date.now() - catalog.fetchedAt < CATALOG_TTL_MS) return catalog;
  if (catalog && catalog.stale && catalog.retryAt && Date.now() < catalog.retryAt) return catalog;
  if (catalogPromise) return catalogPromise;

  catalogPromise = (async () => {
    const fresh = (c) => c && Array.isArray(c.objects) && Date.now() - c.fetchedAt < CATALOG_TTL_MS;
    const disk = readDiskCache();
    if (fresh(disk)) { catalog = disk; indexCatalog(catalog); return catalog; }
    const fallback = disk && Array.isArray(disk.objects) ? disk : null;

    const byNorad = new Map();
    const sources = [];
    const errors = [];
    for (const group of GROUPS) {
      try {
        const txt = await getText(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`);
        const objs = parseTle(txt).map(withShell).filter(Boolean);
        objs.forEach((o) => { if (!byNorad.has(o.norad)) byNorad.set(o.norad, o); });
        sources.push({ group, count: objs.length });
      } catch (e) {
        errors.push(`${group}: ${e.message}`);
      }
    }

    if (!byNorad.size) {
      if (fallback) {
        catalog = { ...fallback, stale: true, errors, retryAt: Date.now() + 30 * 60 * 1000 };
        indexCatalog(catalog);
        return catalog;
      }
      throw new Error(`Could not download orbital data from CelesTrak (${errors.join('; ') || 'no data'})`);
    }

    catalog = { fetchedAt: Date.now(), objects: [...byNorad.values()], sources, errors, stale: false };
    indexCatalog(catalog);
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify(catalog)); } catch (e) { /* optional */ }
    return catalog;
  })().finally(() => { catalogPromise = null; });

  return catalogPromise;
};

// Lookup in the catalogue already in memory or in the on-disk cache (never downloads).
const findInCatalog = (norad) => {
  if (!catalogIndex) {
    const disk = readDiskCache();
    if (disk && Array.isArray(disk.objects)) { catalog = catalog || disk; indexCatalog(disk); }
  }
  return catalogIndex ? catalogIndex.get(String(Number(norad))) || null : null;
};

const runWorker = (workerData) => new Promise((resolve, reject) => {
  const worker = new Worker(path.join(__dirname, 'conjunctionWorker.js'), { workerData });
  const timer = setTimeout(() => {
    worker.terminate();
    reject(new Error('Conjunction screening timed out'));
  }, 240000);
  worker.once('message', (msg) => { clearTimeout(timer); resolve(msg); });
  worker.once('error', (err) => { clearTimeout(timer); reject(err); });
  worker.once('exit', (code) => {
    if (code !== 0) { clearTimeout(timer); reject(new Error(`Screening worker exited with code ${code}`)); }
  });
});

const SEV_RANK = { nominal: 0, warning: 1, critical: 2 };

const classify = (pc, miss) => {
  if (pc >= PC_CRITICAL) return 'critical';
  if (pc >= PC_WARNING || miss < 1) return 'warning';
  return 'nominal';
};

const RECOMMEND = {
  critical: 'High collision risk. Request a CDM / refined tracking and evaluate the manoeuvre options before committing a burn.',
  warning: 'Monitor closely. Re-screen when newer orbital data is available and keep a contingency manoeuvre ready.',
  nominal: 'No action required.',
};

const twinAgeDays = (model, atMs) => {
  if (model.kind !== 'tle') return null;
  return (atMs - O.tleEpochMs(O.satrec(model.l1, model.l2))) / 86400000;
};

// Turn raw worker events into scored events (Pc, severity), keeping states for manoeuvre analysis.
const scoreEvents = (raw, model) => raw.map((e) => {
  const ageObj = e.objEpochMs ? (e.tca - e.objEpochMs) / 86400000 : null;
  const ageTwin = twinAgeDays(model, e.tca);
  const est = PC.estimatePc(e.twin, e.obj, ageTwin, ageObj);
  const severity = classify(est.pc, e.missKm);
  return {
    ...e,
    relV: O.norm(O.sub(e.obj.v, e.twin.v)),
    pc: est.pc,
    pcMethod: est.method,
    ageObj,
    ageTwin,
    severity,
  };
}).sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.pc - a.pc || a.missKm - b.missKm);

const publicEvent = (e, now) => ({
  id: `${e.objectId}-${Math.round(e.tca / 1000)}`,
  objectName: e.objectName,
  objectId: e.objectId,
  source: e.source,
  severity: e.severity,
  tcaTime: new Date(e.tca).toISOString(),
  hoursToTCA: ((e.tca - now) / 3600000).toFixed(1),
  missDistance: e.missKm.toFixed(3),
  relativeVelocity: e.relV.toFixed(2),
  collisionProbability: e.pc.toExponential(1),
  pcMethod: e.pcMethod,
  tleAgeDays: e.ageObj != null ? e.ageObj.toFixed(1) : null,
  recommendation: RECOMMEND[e.severity],
});

const cacheKey = (sc, hours) => `${sc.id}:${sc.tle_line1 || ''}:${sc.tle_line2 || ''}:${JSON.stringify(O.parseConfig(sc.config))}:${hours}`;

/**
 * Screen a twin against the catalogue and the rest of its fleet.
 * Returns { report (API-safe), events (scored, with states), model, catalog meta }.
 */
const screenDetailed = async (sc, fleet = [], { hours = WINDOW_HOURS, force = false } = {}) => {
  const key = cacheKey(sc, hours);
  const hit = results.get(key);
  if (!force && hit && Date.now() - hit.at < RESULT_TTL_MS) return hit.data;
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const cat = await loadCatalog();
    const model = O.twinModel(sc);
    const el = O.describe(model);
    const ownNorad = model.kind === 'tle' ? String(Number(model.l1.slice(2, 7))) : null;
    const lo = O.RE + el.perigeeKm - SHELL_PAD_KM;
    const hi = O.RE + el.apogeeKm + SHELL_PAD_KM;
    const candidates = cat.objects
      .filter((o) => o.rp <= hi && o.ra >= lo && String(Number(o.norad)) !== ownNorad)
      .map(({ name, norad, l1, l2 }) => ({ name, norad, l1, l2 }));
    const others = fleet
      .filter((f) => String(f.id) !== String(sc.id))
      .map((f) => ({ name: f.name, id: String(f.id), model: O.twinModel(f) }))
      .filter((f) => {
        if (f.model.kind === 'tle' && ownNorad && String(Number(f.model.l1.slice(2, 7))) === ownNorad) return false;
        try { const e = O.describe(f.model); return O.RE + e.perigeeKm <= hi && O.RE + e.apogeeKm >= lo; } catch (e) { return false; }
      });

    const started = Date.now();
    const startMs = Date.now();
    const raw = await runWorker({
      twin: model, candidates, others, startMs, hours, stepSec: STEP_SEC, reportKm: REPORT_KM,
    });
    const events = scoreEvents(raw.events, model);
    const now = Date.now();

    const report = {
      totalEvents: events.length,
      criticalCount: events.filter((e) => e.severity === 'critical').length,
      warningCount: events.filter((e) => e.severity === 'warning').length,
      events: events.slice(0, 25).map((e) => publicEvent(e, now)),
      twin: {
        orbitSource: model.kind === 'tle' ? 'tle' : 'design',
        noradId: ownNorad ? Number(ownNorad) : null,
        tleEpoch: el.epoch,
        tleAgeDays: model.kind === 'tle' ? Number(twinAgeDays(model, now).toFixed(2)) : null,
        perigeeKm: Number(el.perigeeKm.toFixed(1)),
        apogeeKm: Number(el.apogeeKm.toFixed(1)),
        inclinationDeg: Number(el.inclinationDeg.toFixed(3)),
      },
      screening: {
        method: `SGP4 propagation of CelesTrak GP data, ${STEP_SEC} s grid search + golden-section refinement to TCA`,
        pcModel: `Foster 2D, combined hard-body radius ${(PC.hbrKm() * 1000).toFixed(0)} m, covariance estimated from TLE age. Not an operational CDM.`,
        thresholds: { critical: PC_CRITICAL, warning: PC_WARNING },
        windowHours: hours,
        windowStart: new Date(startMs).toISOString(),
        stepSeconds: STEP_SEC,
        reportThresholdKm: REPORT_KM,
        catalogObjects: cat.objects.length,
        candidatesScreened: raw.screened,
        candidatesFailed: raw.failed,
        fleetTwinsScreened: others.length,
        colocatedObjects: raw.colocated || [],
        catalogFetchedAt: new Date(cat.fetchedAt).toISOString(),
        catalogStale: !!cat.stale,
        sources: cat.sources,
        twinAltitudeKm: Number(el.altitudeKm.toFixed(1)),
        computeSeconds: ((Date.now() - started) / 1000).toFixed(1),
      },
      generatedAt: new Date(now).toISOString(),
    };

    const data = { report, events, model, startMs, hours, candidates, others };
    results.set(key, { at: Date.now(), data });
    if (results.size > 200) results.delete(results.keys().next().value);
    return data;
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
};

const screen = async (sc, fleet, opts) => (await screenDetailed(sc, fleet, opts)).report;

// Re-screen a modified twin trajectory (twin model + sampled position delta) against the same candidates.
const rescreen = async (base, delta) => {
  const raw = await runWorker({
    twin: { ...base.model, delta },
    candidates: base.candidates,
    others: base.others,
    startMs: base.startMs,
    hours: base.hours,
    stepSec: STEP_SEC,
    reportKm: REPORT_KM,
  });
  return scoreEvents(raw.events, base.model);
};

module.exports = {
  screen, screenDetailed, rescreen, loadCatalog, findInCatalog, classify, scoreEvents, publicEvent,
  thresholds: { critical: PC_CRITICAL, warning: PC_WARNING },
};
