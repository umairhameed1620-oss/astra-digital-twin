// ASTRA real conjunction screening
// Catalogue: CelesTrak GP data (TLE).  Propagation: SGP4 (satellite.js) in a worker thread.
// The twin itself is modelled as the same circular orbit the 3D visualiser draws.
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

const GROUPS = [
  'active',              // all active payloads (incl. Starlink, OneWeb, ISS...)
  'cosmos-1408-debris',  // 2021 Russian ASAT test debris
  'fengyun-1c-debris',   // 2007 Chinese ASAT test debris
  'iridium-33-debris',   // 2009 Iridium-Cosmos collision
  'cosmos-2251-debris',
];

const MU = 398600.4418;          // km^3/s^2
const RE = 6378.137;             // km, equatorial radius (altitudes are measured from this)
const DEG = Math.PI / 180;
const EPOCH = Date.UTC(2026, 0, 1);
const HBR_KM = 0.015;            // combined hard-body radius (15 m)
const CATALOG_TTL_MS = 6 * 3600 * 1000;   // CelesTrak asks users not to re-download more often than every few hours
const RESULT_TTL_MS = 30 * 60 * 1000;
const SHELL_PAD_KM = 30;
const REPORT_KM = 10;
const WINDOW_HOURS = Number(process.env.CONJ_WINDOW_HOURS) || 24;
const STEP_SEC = Number(process.env.CONJ_STEP_SEC) || 30;
const CACHE_FILE = path.join(os.tmpdir(), 'astra-celestrak-catalog.json');

const REDIS_KEY = 'astra:celestrak:catalog';
const REDIS_TTL_SEC = 48 * 3600; // keep a stale copy for fallback; freshness is checked via fetchedAt

// Optional Redis cache so the catalogue survives backend rebuilds (CelesTrak blocks repeat downloads)
let redisCache = null;
try { redisCache = require('./redis').cache || null; } catch (e) { redisCache = null; }

const withTimeout = (p, ms) => Promise.race([p, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
const redisGet = async () => {
  if (!redisCache || typeof redisCache.get !== 'function') return null;
  try {
    const v = await withTimeout(redisCache.get(REDIS_KEY), 3000);
    if (!v) return null;
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch (e) { return null; }
};
const redisSet = async (value) => {
  if (!redisCache || typeof redisCache.set !== 'function') return;
  try { await withTimeout(redisCache.set(REDIS_KEY, value, REDIS_TTL_SEC), 5000); } catch (e) { /* optional */ }
};

let catalog = null;
let catalogPromise = null;
const results = new Map();
const inflight = new Map();

// ---------- helpers ----------
const hash = (s) => {
  let x = 0;
  for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(x);
};

const parseConfig = (cfg) => {
  if (!cfg) return {};
  if (typeof cfg === 'string') {
    try { return JSON.parse(cfg); } catch (e) { return {}; }
  }
  return cfg;
};

// Same circular-orbit model as the frontend visualiser
const twinOrbit = (sc) => {
  const cfg = parseConfig(sc.config);
  const altitude = Number(cfg.altitude) || 550;
  const a = RE + altitude;
  return {
    altitude,
    a,
    n: Math.sqrt(MU / (a * a * a)),
    inc: Number(cfg.inclination ?? 53) * DEG,
    raan: (cfg.raan != null ? Number(cfg.raan) : hash(sc.id) % 360) * DEG,
    u0: (cfg.trueAnomaly != null ? Number(cfg.trueAnomaly) : hash(`${sc.id}u`) % 360) * DEG,
    epoch: EPOCH,
  };
};

const httpGet = (url, redirects = 3) => new Promise((resolve, reject) => {
  const req = https.get(url, {
    headers: { 'User-Agent': 'ASTRA-DigitalTwin/2.0 (conjunction screening; cached 6h)' },
    timeout: 45000,
  }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
      res.resume();
      return resolve(httpGet(new URL(res.headers.location, url).toString(), redirects - 1));
    }
    if (res.statusCode !== 200) {
      res.resume();
      return reject(new Error(`HTTP ${res.statusCode}`));
    }
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { data += c; });
    res.on('end', () => resolve(data));
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', reject);
});

const parseTle = (text) => {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const l1 = lines[i];
    const l2 = lines[i + 1];
    if (!(l1.startsWith('1 ') && l2.startsWith('2 '))) continue;
    const prev = i > 0 ? lines[i - 1] : '';
    const norad = l1.slice(2, 7).trim();
    const name = prev && !prev.startsWith('1 ') && !prev.startsWith('2 ') ? prev.trim() : `NORAD ${norad}`;
    const inc = parseFloat(l2.slice(8, 16));
    const ecc = parseFloat(`0.${l2.slice(26, 33).trim()}`);
    const revPerDay = parseFloat(l2.slice(52, 63));
    if (!revPerDay || Number.isNaN(ecc)) { i++; continue; }
    const n = (revPerDay * 2 * Math.PI) / 86400;
    const a = Math.cbrt(MU / (n * n));
    out.push({ name, norad, l1, l2, inc, rp: a * (1 - ecc), ra: a * (1 + ecc) });
    i++;
  }
  return out;
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
    if (fresh(disk)) { catalog = disk; return catalog; }
    const cached = await redisGet();
    if (fresh(cached)) {
      catalog = cached;
      try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cached)); } catch (e) { /* optional */ }
      return catalog;
    }
    const fallback = [disk, cached].filter((c) => c && Array.isArray(c.objects))
      .sort((x, y) => y.fetchedAt - x.fetchedAt)[0] || null;

    const byNorad = new Map();
    const sources = [];
    const errors = [];
    for (const group of GROUPS) {
      try {
        const txt = await httpGet(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`);
        const objs = parseTle(txt);
        objs.forEach((o) => { if (!byNorad.has(o.norad)) byNorad.set(o.norad, o); });
        sources.push({ group, count: objs.length });
      } catch (e) {
        errors.push(`${group}: ${e.message}`);
      }
    }

    if (!byNorad.size) {
      if (fallback) {
        catalog = { ...fallback, stale: true, errors, retryAt: Date.now() + 30 * 60 * 1000 };
        return catalog;
      }
      throw new Error(`Could not download orbital data from CelesTrak (${errors.join('; ') || 'no data'})`);
    }

    catalog = { fetchedAt: Date.now(), objects: [...byNorad.values()], sources, errors, stale: false };
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify(catalog)); } catch (e) { /* cache is optional */ }
    await redisSet(catalog);
    return catalog;
  })().finally(() => { catalogPromise = null; });

  return catalogPromise;
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

// Simplified 2D probability for a small hard-body radius and isotropic position uncertainty.
// sigma grows with the age of the TLE (TLEs are ~1 km accurate at epoch and degrade by roughly 1 km/day).
const estimatePc = (missKm, ageDays) => {
  const sigma = Math.max(0.5, 0.5 + 1.0 * Math.abs(ageDays));
  const s2 = sigma * sigma;
  return Math.min(1, ((HBR_KM * HBR_KM) / (2 * s2)) * Math.exp(-(missKm * missKm) / (2 * s2)));
};

const classify = (pc, miss) => {
  if (pc >= 1e-4) return 'critical';
  if (pc >= 1e-6 || miss < 1) return 'warning';
  return 'nominal';
};

const RECOMMEND = {
  critical: 'High collision risk. Plan an avoidance manoeuvre and request refined tracking (CDM) before committing the burn.',
  warning: 'Monitor closely. Re-screen when newer orbital data is available; prepare a contingency manoeuvre.',
  nominal: 'No action required.',
};

const buildReport = (raw, ctx) => {
  const now = Date.now();
  const events = raw.events.map((e) => {
    const pc = estimatePc(e.missKm, e.ageDays);
    const severity = classify(pc, e.missKm);
    return {
      id: `${e.objectId}-${Math.round(e.tca / 1000)}`,
      objectName: e.objectName,
      objectId: e.objectId,
      source: e.source,
      severity,
      tcaTime: new Date(e.tca).toISOString(),
      hoursToTCA: ((e.tca - now) / 3600000).toFixed(1),
      missDistance: e.missKm.toFixed(3),
      relativeVelocity: e.relV.toFixed(2),
      collisionProbability: pc.toExponential(1),
      pcValue: pc,
      tleAgeDays: e.ageDays.toFixed(1),
      recommendation: RECOMMEND[severity],
    };
  }).sort((a, b) => b.pcValue - a.pcValue || parseFloat(a.missDistance) - parseFloat(b.missDistance));

  const top = events.slice(0, 25).map(({ pcValue, ...rest }) => rest);
  return {
    totalEvents: events.length,
    criticalCount: events.filter((e) => e.severity === 'critical').length,
    warningCount: events.filter((e) => e.severity === 'warning').length,
    events: top,
    screening: {
      method: 'SGP4 propagation of CelesTrak GP data, 30 s grid search + golden-section refinement to TCA',
      pcModel: 'Estimated (2D, 15 m combined hard-body radius, uncertainty from TLE age). Not an operational CDM.',
      windowHours: ctx.hours,
      stepSeconds: ctx.stepSec,
      reportThresholdKm: REPORT_KM,
      catalogObjects: ctx.catalogSize,
      candidatesScreened: raw.screened,
      candidatesFailed: raw.failed,
      fleetTwinsScreened: ctx.fleetCount,
      catalogFetchedAt: new Date(ctx.fetchedAt).toISOString(),
      catalogStale: !!ctx.stale,
      sources: ctx.sources,
      twinAltitudeKm: ctx.altitude,
      computeSeconds: ctx.computeSeconds,
    },
    generatedAt: new Date(now).toISOString(),
  };
};

// ---------- public API ----------
const screen = async (sc, fleet = [], { hours = WINDOW_HOURS } = {}) => {
  const key = `${sc.id}:${JSON.stringify(parseConfig(sc.config))}:${hours}`;
  const hit = results.get(key);
  if (hit && Date.now() - hit.at < RESULT_TTL_MS) return hit.data;
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const cat = await loadCatalog();
    const twin = twinOrbit(sc);
    const candidates = cat.objects
      .filter((o) => o.rp <= twin.a + SHELL_PAD_KM && o.ra >= twin.a - SHELL_PAD_KM)
      .map(({ name, norad, l1, l2 }) => ({ name, norad, l1, l2 }));
    const others = fleet
      .filter((f) => String(f.id) !== String(sc.id))
      .map((f) => ({ name: f.name, id: String(f.id), orbit: twinOrbit(f) }))
      .filter((f) => Math.abs(f.orbit.a - twin.a) <= SHELL_PAD_KM);

    const started = Date.now();
    const raw = await runWorker({
      twin, candidates, others, startMs: Date.now(), hours, stepSec: STEP_SEC, reportKm: REPORT_KM,
    });

    const data = buildReport(raw, {
      hours,
      stepSec: STEP_SEC,
      catalogSize: cat.objects.length,
      fleetCount: others.length,
      fetchedAt: cat.fetchedAt,
      stale: cat.stale,
      sources: cat.sources,
      altitude: twin.altitude,
      computeSeconds: ((Date.now() - started) / 1000).toFixed(1),
    });
    results.set(key, { at: Date.now(), data });
    return data;
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
};

const planManoeuvre = (sc, report) => {
  const cfg = parseConfig(sc.config);
  const altitude = Number(cfg.altitude) || 550;
  const budget = Number(cfg.deltaV ?? cfg.deltaVBudget ?? cfg.dv ?? 0);

  const threat = report.events.find((e) => e.severity === 'critical')
    || report.events.find((e) => e.severity === 'warning');

  if (!threat) {
    return {
      required: false,
      message: 'No critical or warning conjunctions in the screening window. No manoeuvre required.',
      deltaVBudgetRemaining: budget,
    };
  }

  const dh = threat.severity === 'critical' ? 2 : 1; // km of radial separation
  const r1 = RE + altitude;
  const r2 = r1 + dh;
  const dv1 = Math.sqrt(MU / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1) * 1000;   // m/s
  const dv2 = Math.sqrt(MU / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2))) * 1000;   // m/s
  const transferSec = Math.PI * Math.sqrt(Math.pow((r1 + r2) / 2, 3) / MU);
  const total = dv1 + dv2;
  const after = budget - total;

  const tca = Date.parse(threat.tcaTime);
  const burn1 = new Date(Math.max(Date.now() + 10 * 60000, tca - (transferSec * 1000 + 2 * 3600000)));
  const burn2 = new Date(burn1.getTime() + transferSec * 1000);

  let warning = null;
  if (after < 0) warning = 'Insufficient ΔV budget for this manoeuvre.';
  else if (after < 30) warning = 'Low ΔV reserve after manoeuvre. Keep at least 30 m/s for end-of-life deorbit.';

  return {
    required: true,
    threat: {
      objectName: threat.objectName,
      objectId: threat.objectId,
      severity: threat.severity,
      tcaTime: threat.tcaTime,
      missDistance: threat.missDistance,
      collisionProbability: threat.collisionProbability,
    },
    currentAltitude: altitude,
    recommendedAltitude: altitude + dh,
    manoeuvre: {
      strategy: `Hohmann raise of ${dh} km`,
      dv1: `${dv1.toFixed(3)} m/s`,
      dv2: `${dv2.toFixed(3)} m/s`,
      totalDeltaV: `${total.toFixed(3)} m/s`,
      transferTime: `${(transferSec / 60).toFixed(1)} min`,
      burn1Time: burn1.toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
      burn2Time: burn2.toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    },
    deltaVBudgetRemaining: budget,
    budgetAfterManoeuvre: after.toFixed(2),
    warning,
  };
};

module.exports = { screen, planManoeuvre, loadCatalog };
