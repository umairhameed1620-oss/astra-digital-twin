// Worker thread: propagates candidate objects with SGP4 and finds close approaches to the twin.
// Input (workerData):
//   twin:       twin model (lib/orbit twinModel) + optional delta {startMs, stepMs, dx, dy, dz}
//   candidates: [{name, norad, l1, l2}] catalogue objects inside the twin's altitude shell
//   others:     [{name, id, model}] other twins in the same fleet
//   startMs, hours, stepSec, reportKm
// Output: { events: [{objectName, objectId, source, tca, missKm, twin:{r,v}, obj:{r,v}, objEpochMs}], screened, failed }
const { parentPort, workerData } = require('worker_threads');
const O = require('../lib/orbit');

const MAX_REL_V = 16; // km/s, upper bound for LEO relative speed
const PHI = (Math.sqrt(5) - 1) / 2;

const { twin, candidates, others, startMs, hours, stepSec, reportKm } = workerData;

const baseTwin = O.stateFn(twin.kind === 'tle' ? { kind: 'tle', l1: twin.l1, l2: twin.l2 } : twin);

// Optional position offset (manoeuvre re-screening): linear interpolation of sampled delta.
const delta = twin.delta || null;
const deltaAt = (ms) => {
  if (!delta) return null;
  const f = (ms - delta.startMs) / delta.stepMs;
  if (f <= 0) return null;
  const i = Math.min(Math.floor(f), delta.dx.length - 2);
  if (i < 0) return null;
  const w = Math.min(1, f - i);
  return O.v3(
    delta.dx[i] + (delta.dx[i + 1] - delta.dx[i]) * w,
    delta.dy[i] + (delta.dy[i + 1] - delta.dy[i]) * w,
    delta.dz[i] + (delta.dz[i + 1] - delta.dz[i]) * w
  );
};
const twinState = (ms) => {
  const s = baseTwin(ms);
  if (!s) return null;
  const d = deltaAt(ms);
  return d ? { r: O.add(s.r, d), v: s.v } : s;
};

const N = Math.floor((hours * 3600) / stepSec) + 1;
const stepMs = stepSec * 1000;
const COARSE_KM = (MAX_REL_V * stepSec) / 2 + 25;

const tx = new Float64Array(N);
const ty = new Float64Array(N);
const tz = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const s = twinState(startMs + i * stepMs);
  if (!s) throw new Error('Twin orbit could not be propagated over the screening window');
  tx[i] = s.r.x; ty[i] = s.r.y; tz[i] = s.r.z;
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

const screenObject = (objState, meta) => {
  const dist = (ms) => {
    const p = objState(ms);
    const q = twinState(ms);
    if (!p || !q) return Infinity;
    return O.norm(O.sub(p.r, q.r));
  };
  const found = [];

  const check = (k, dk, dPrev, dNext) => {
    if (!(dk < COARSE_KM && dk <= dPrev && dk <= dNext)) return;
    const lo = startMs + Math.max(0, k - 1) * stepMs;
    const hi = startMs + Math.min(N - 1, k + 1) * stepMs;
    const m = goldenMin(dist, lo, hi);
    if (!(m.d < reportKm)) return;
    if (found.some((t) => Math.abs(t - m.t) < 60000)) return;
    found.push(m.t);
    const p = objState(m.t);
    const q = twinState(m.t);
    events.push({
      objectName: meta.name,
      objectId: meta.id,
      source: meta.source,
      tca: m.t,
      missKm: m.d,
      twin: q,
      obj: p,
      objEpochMs: meta.epochMs || null,
      tle: meta.tle || null,
      model: meta.model || null,
    });
  };

  let d0 = Infinity;
  let d1 = Infinity;
  for (let i = 0; i < N; i++) {
    const p = objState(startMs + i * stepMs);
    if (!p) return false;
    const d = Math.hypot(p.r.x - tx[i], p.r.y - ty[i], p.r.z - tz[i]);
    if (i >= 1) check(i - 1, d1, d0, d);
    d0 = d1;
    d1 = d;
  }
  check(N - 1, d1, d0, Infinity);
  return true;
};

for (const c of candidates) {
  let rec;
  try { rec = O.satrec(c.l1, c.l2); } catch (e) { failed++; continue; }
  const epochMs = O.tleEpochMs(rec);
  const ok = screenObject((ms) => O.sgp4State(rec, ms), {
    name: c.name, id: c.norad, source: 'CelesTrak', epochMs, tle: { l1: c.l1, l2: c.l2 },
  });
  if (ok) screened++; else failed++;
}

for (const o of others) {
  let fn;
  try { fn = O.stateFn(o.model); } catch (e) { continue; }
  screenObject(fn, {
    name: `${o.name} (ASTRA twin)`,
    id: o.model.kind === 'tle' && o.model.norad ? String(o.model.norad) : `TWIN-${String(o.id).slice(0, 8)}`,
    source: 'ASTRA fleet',
    epochMs: o.model.kind === 'tle' ? O.tleEpochMs(O.satrec(o.model.l1, o.model.l2)) : null,
    tle: o.model.kind === 'tle' ? { l1: o.model.l1, l2: o.model.l2 } : null,
    model: o.model,
  });
}

parentPort.postMessage({ events, screened, failed, steps: N });
