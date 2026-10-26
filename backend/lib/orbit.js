// Shared orbital mechanics: vectors, frames, twin trajectory models, J2 numerical propagation.
// Units: km, km/s, seconds, radians unless stated. Inertial frame is TEME (what SGP4 outputs);
// over a 24-48 h screening window the TEME/J2000 difference does not change relative geometry.
const satellite = require('satellite.js');

const MU = 398600.4418;
const RE = 6378.137;
const J2 = 1.08262668e-3;
const DEG = Math.PI / 180;
const EPOCH = Date.UTC(2026, 0, 1); // reference epoch of the idealised circular twin model

// ---------- vectors ----------
const v3 = (x, y, z) => ({ x, y, z });
const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a, k) => v3(a.x * k, a.y * k, a.z * k);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const norm = (a) => Math.sqrt(dot(a, a));
const unit = (a) => { const n = norm(a); return n > 0 ? scale(a, 1 / n) : v3(0, 0, 0); };

// RTN unit vectors (radial, along-track, cross-track) for a state.
const rtnBasis = (r, v) => {
  const R = unit(r);
  const N = unit(cross(r, v));
  const T = cross(N, R);
  return { R, T, N };
};

// Rotate a 3x3 covariance given in RTN into the inertial frame: C = M * Crtn * M^T, M = [R T N].
const covRtnToInertial = (crtn, r, v) => {
  const { R, T, N } = rtnBasis(r, v);
  const M = [[R.x, T.x, N.x], [R.y, T.y, N.y], [R.z, T.z, N.z]];
  const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) s += M[i][k] * crtn[k][l] * M[j][l];
      out[i][j] = s;
    }
  }
  return out;
};

const addCov = (a, b) => a.map((row, i) => row.map((x, j) => x + b[i][j]));
const diagCov = (sr, st, sn) => [[sr * sr, 0, 0], [0, st * st, 0], [0, 0, sn * sn]];

// ---------- hashing (same deterministic placement the frontend uses) ----------
const hash = (s) => {
  let x = 0;
  for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(x);
};

const parseConfig = (cfg) => {
  if (!cfg) return {};
  if (typeof cfg === 'string') { try { return JSON.parse(cfg); } catch (e) { return {}; } }
  return cfg;
};

// ---------- TLE helpers ----------
const tleEpochMs = (rec) => (rec.jdsatepoch - 2440587.5) * 86400000 + (rec.jdsatepochF || 0) * 86400000;

const satrec = (l1, l2) => {
  const rec = satellite.twoline2satrec(l1, l2);
  if (!rec || rec.error) throw new Error(`Invalid TLE (SGP4 error ${rec ? rec.error : '?'})`);
  return rec;
};

const sgp4State = (rec, ms) => {
  const r = satellite.sgp4(rec, (ms - tleEpochMs(rec)) / 60000);
  if (!r || !r.position || typeof r.position !== 'object') return null;
  return { r: r.position, v: r.velocity };
};

// ---------- twin models ----------
// A twin is either linked to a real TLE (SGP4) or an idealised circular orbit from its config.
const twinModel = (sc) => {
  const cfg = parseConfig(sc.config);
  if (sc.tle_line1 && sc.tle_line2) {
    return { kind: 'tle', l1: sc.tle_line1, l2: sc.tle_line2, norad: sc.norad_id || null };
  }
  const altitude = Number(cfg.altitude) || 550;
  const a = RE + altitude;
  return {
    kind: 'circular',
    altitude,
    a,
    n: Math.sqrt(MU / (a * a * a)),
    inc: Number(cfg.inclination ?? 53) * DEG,
    raan: (cfg.raan != null ? Number(cfg.raan) : hash(sc.id) % 360) * DEG,
    u0: (cfg.trueAnomaly != null ? Number(cfg.trueAnomaly) : hash(`${sc.id}u`) % 360) * DEG,
    epoch: EPOCH,
  };
};

const circularState = (o, ms) => {
  const u = o.u0 + o.n * ((ms - o.epoch) / 1000);
  const cu = Math.cos(u), su = Math.sin(u);
  const cO = Math.cos(o.raan), sO = Math.sin(o.raan);
  const ci = Math.cos(o.inc), si = Math.sin(o.inc);
  const k = o.a * o.n;
  return {
    r: v3(o.a * (cO * cu - sO * su * ci), o.a * (sO * cu + cO * su * ci), o.a * (su * si)),
    v: v3(k * (-cO * su - sO * cu * ci), k * (-sO * su + cO * cu * ci), k * (cu * si)),
  };
};

// Returns a function ms -> {r, v} (or null) for a twin model.
const stateFn = (model) => {
  if (model.kind === 'tle') {
    const rec = satrec(model.l1, model.l2);
    return (ms) => sgp4State(rec, ms);
  }
  return (ms) => circularState(model, ms);
};

// Mean orbital elements of a twin, for display and shell filtering.
const describe = (model) => {
  if (model.kind === 'tle') {
    const rec = satrec(model.l1, model.l2);
    const n = rec.no / 60; // rad/s (Kozai mean motion in rad/min -> rad/s)
    const a = Math.cbrt(MU / (n * n));
    return {
      a,
      perigeeKm: a * (1 - rec.ecco) - RE,
      apogeeKm: a * (1 + rec.ecco) - RE,
      altitudeKm: a - RE,
      inclinationDeg: rec.inclo / DEG,
      raanDeg: rec.nodeo / DEG,
      eccentricity: rec.ecco,
      periodMin: (2 * Math.PI) / n / 60,
      epoch: new Date(tleEpochMs(rec)).toISOString(),
    };
  }
  return {
    a: model.a,
    perigeeKm: model.altitude,
    apogeeKm: model.altitude,
    altitudeKm: model.altitude,
    inclinationDeg: model.inc / DEG,
    raanDeg: model.raan / DEG,
    eccentricity: 0,
    periodMin: (2 * Math.PI) / model.n / 60,
    epoch: null,
  };
};

// ---------- J2 numerical propagation (for manoeuvre analysis) ----------
const accel = (r) => {
  const rn = norm(r);
  const r2 = rn * rn;
  const k = -MU / (r2 * rn);
  const z2 = (r.z * r.z) / r2;
  const f = (1.5 * J2 * MU * RE * RE) / (r2 * r2 * rn);
  return v3(
    k * r.x + f * r.x * (5 * z2 - 1),
    k * r.y + f * r.y * (5 * z2 - 1),
    k * r.z + f * r.z * (5 * z2 - 3)
  );
};

const rk4 = (s, h) => {
  const k1v = accel(s.r), k1r = s.v;
  const s2r = add(s.r, scale(k1r, h / 2)), s2v = add(s.v, scale(k1v, h / 2));
  const k2v = accel(s2r), k2r = s2v;
  const s3r = add(s.r, scale(k2r, h / 2)), s3v = add(s.v, scale(k2v, h / 2));
  const k3v = accel(s3r), k3r = s3v;
  const s4r = add(s.r, scale(k3r, h)), s4v = add(s.v, scale(k3v, h));
  const k4v = accel(s4r), k4r = s4v;
  return {
    r: add(s.r, scale(add(add(k1r, scale(k2r, 2)), add(scale(k3r, 2), k4r)), h / 6)),
    v: add(s.v, scale(add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v)), h / 6)),
  };
};

// Propagate from (t0, s0) to t1 (ms), applying impulsive burns [{ms, dvRtn: {r,t,n} in km/s}] on the way.
const propagate = (s0, t0, t1, burns = [], stepSec = 10) => {
  let s = { r: { ...s0.r }, v: { ...s0.v } };
  let t = t0;
  const pending = burns.filter((b) => b.ms >= t0 && b.ms <= t1).sort((a, b) => a.ms - b.ms);
  const applyBurn = (b) => {
    const { R, T, N } = rtnBasis(s.r, s.v);
    s = { r: s.r, v: add(s.v, add(add(scale(R, b.dvRtn.r || 0), scale(T, b.dvRtn.t || 0)), scale(N, b.dvRtn.n || 0))) };
  };
  while (t < t1) {
    const next = pending.length ? Math.min(pending[0].ms, t1) : t1;
    while (t < next) {
      const h = Math.min(stepSec * 1000, next - t);
      s = rk4(s, h / 1000);
      t += h;
    }
    if (pending.length && t >= pending[0].ms) applyBurn(pending.shift());
  }
  return s;
};

module.exports = {
  MU, RE, J2, DEG, EPOCH,
  v3, add, sub, scale, dot, cross, norm, unit,
  rtnBasis, covRtnToInertial, addCov, diagCov,
  hash, parseConfig, tleEpochMs, satrec, sgp4State,
  twinModel, circularState, stateFn, describe, propagate,
};
