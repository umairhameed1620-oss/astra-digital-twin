// Worker thread: propagates the screening catalogue with SGP4 and finds close approaches to the twin.
const { parentPort, workerData } = require('worker_threads');
const satellite = require('satellite.js');

const MAX_REL_V = 16; // km/s, upper bound for LEO relative velocity
const PHI = (Math.sqrt(5) - 1) / 2;

const { twin, candidates, others, startMs, hours, stepSec, reportKm } = workerData;

// Circular orbit in an inertial frame (same model as the frontend)
const eci = (o, ms) => {
  const u = o.u0 + o.n * ((ms - o.epoch) / 1000);
  const cu = Math.cos(u), su = Math.sin(u);
  const cO = Math.cos(o.raan), sO = Math.sin(o.raan);
  const ci = Math.cos(o.inc), si = Math.sin(o.inc);
  return { x: o.a * (cO * cu - sO * su * ci), y: o.a * (sO * cu + cO * su * ci), z: o.a * (su * si) };
};

const eciVel = (o, ms) => {
  const u = o.u0 + o.n * ((ms - o.epoch) / 1000);
  const cu = Math.cos(u), su = Math.sin(u);
  const cO = Math.cos(o.raan), sO = Math.sin(o.raan);
  const ci = Math.cos(o.inc), si = Math.sin(o.inc);
  const k = o.a * o.n;
  return { x: k * (-cO * su - sO * cu * ci), y: k * (-sO * su + cO * cu * ci), z: k * (cu * si) };
};

const N = Math.floor((hours * 3600) / stepSec) + 1;
const stepMs = stepSec * 1000;
const COARSE_KM = (MAX_REL_V * stepSec) / 2 + 25;

// Pre-compute the twin's positions on the grid
const tx = new Float64Array(N);
const ty = new Float64Array(N);
const tz = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const p = eci(twin, startMs + i * stepMs);
  tx[i] = p.x; ty[i] = p.y; tz[i] = p.z;
}

const goldenMin = (f, lo, hi) => {
  let a = lo, b = hi;
  let c = b - PHI * (b - a), d = a + PHI * (b - a);
  let fc = f(c), fd = f(d);
  for (let k = 0; k < 45; k++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - PHI * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + PHI * (b - a); fd = f(d); }
  }
  return fc < fd ? { t: c, d: fc } : { t: d, d: fd };
};

const events = [];
let screened = 0;
let failed = 0;

// Generic screen of one object given position/velocity functions (km, km/s)
const screenObject = (getPos, getVel, meta) => {
  const dist = (ms) => {
    const p = getPos(ms);
    if (!p) return Infinity;
    const q = eci(twin, ms);
    return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  };
  const found = [];

  const check = (k, dk, dPrev, dNext) => {
    if (!(dk < COARSE_KM && dk <= dPrev && dk <= dNext)) return;
    const lo = startMs + Math.max(0, k - 1) * stepMs;
    const hi = startMs + Math.min(N - 1, k + 1) * stepMs;
    const m = goldenMin(dist, lo, hi);
    if (!(m.d < reportKm)) return;
    if (found.some((t) => Math.abs(t - m.t) < 60000)) return; // same encounter
    found.push(m.t);
    const v = getVel(m.t);
    const w = eciVel(twin, m.t);
    const relV = v ? Math.hypot(v.x - w.x, v.y - w.y, v.z - w.z) : 0;
    events.push({
      objectName: meta.name,
      objectId: meta.id,
      source: meta.source,
      tca: m.t,
      missKm: m.d,
      relV,
      ageDays: meta.epochMs ? (m.t - meta.epochMs) / 86400000 : 0,
    });
  };

  let d0 = Infinity; // two steps back
  let d1 = Infinity; // previous step
  for (let i = 0; i < N; i++) {
    const p = getPos(startMs + i * stepMs);
    if (!p) return false;
    const d = Math.hypot(p.x - tx[i], p.y - ty[i], p.z - tz[i]);
    if (i >= 1) check(i - 1, d1, d0, d);
    d0 = d1;
    d1 = d;
  }
  check(N - 1, d1, d0, Infinity);
  return true;
};

// Catalogue objects (SGP4)
for (const c of candidates) {
  let rec;
  try { rec = satellite.twoline2satrec(c.l1, c.l2); } catch (e) { failed++; continue; }
  if (!rec || rec.error) { failed++; continue; }
  const epochMs = (rec.jdsatepoch - 2440587.5) * 86400000 + (rec.jdsatepochF ? rec.jdsatepochF * 86400000 : 0);

  const prop = (ms) => {
    const r = satellite.sgp4(rec, (ms - epochMs) / 60000);
    if (!r || !r.position || typeof r.position !== 'object') return null;
    return r;
  };
  const ok = screenObject(
    (ms) => { const r = prop(ms); return r ? r.position : null; },
    (ms) => { const r = prop(ms); return r ? r.velocity : null; },
    { name: c.name, id: c.norad, source: 'CelesTrak', epochMs }
  );
  if (ok) screened++; else failed++;
}

// Other twins in the user's fleet (same analytic model)
for (const o of others) {
  screenObject(
    (ms) => eci(o.orbit, ms),
    (ms) => eciVel(o.orbit, ms),
    { name: `${o.name} (ASTRA twin)`, id: `TWIN-${o.id.slice(0, 8)}`, source: 'ASTRA fleet', epochMs: 0 }
  );
}

parentPort.postMessage({ events, screened, failed, steps: N });
