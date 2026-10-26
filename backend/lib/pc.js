// Collision probability, Foster (1992) 2D method.
// The combined position covariance is projected onto the encounter plane (perpendicular to the
// relative velocity) and a 2D Gaussian is integrated over the combined hard-body circle.
const O = require('./orbit');

// ---------- accurate normal tails (relative accuracy ~1e-7 everywhere, incl. far tails) ----------
const erfc = (x) => {
  // Numerical Recipes erfcc (Chebyshev fit), fractional error < 1.2e-7.
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418
    + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587
    + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
};
const Q = (z) => 0.5 * erfc(z / Math.SQRT2); // upper tail P(Z > z)

// P(a < Z < b) computed in whichever tail keeps precision.
const normInterval = (a, b) => {
  if (b <= a) return 0;
  if (a >= 0) return Q(a) - Q(b);
  if (b <= 0) return Q(-b) - Q(-a);
  return 1 - Q(-a) - Q(b);
};

// Symmetric 2x2 eigen-decomposition.
const eig2 = (a, b, c) => {
  const tr = a + c;
  const det = a * c - b * b;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = tr / 2 - disc;
  const theta = Math.abs(b) < 1e-30 ? (a >= c ? 0 : Math.PI / 2) : Math.atan2(l1 - a, b);
  return { l1, l2, theta };
};

/**
 * Foster 2D probability of collision.
 * @param {{x,y,z}} rRel relative position at TCA (km), object2 - object1
 * @param {{x,y,z}} vRel relative velocity at TCA (km/s)
 * @param {number[][]} cov combined 3x3 position covariance in the same frame (km^2)
 * @param {number} hbrKm combined hard-body radius (km)
 */
const foster = (rRel, vRel, cov, hbrKm) => {
  const ev = O.unit(vRel);
  const rp = O.sub(rRel, O.scale(ev, O.dot(rRel, ev)));
  const miss = O.norm(rp);
  let e1 = miss > 1e-9 ? O.scale(rp, 1 / miss) : O.unit(O.cross(ev, Math.abs(ev.x) < 0.9 ? O.v3(1, 0, 0) : O.v3(0, 1, 0)));
  const e2 = O.cross(ev, e1);
  const q = (u, w) => {
    let s = 0;
    const U = [u.x, u.y, u.z], W = [w.x, w.y, w.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += U[i] * cov[i][j] * W[j];
    return s;
  };
  const c11 = q(e1, e1), c12 = q(e1, e2), c22 = q(e2, e2);
  const { l1, l2, theta } = eig2(c11, c12, c22);
  if (!(l1 > 0) || !(l2 > 0)) return { pc: miss < hbrKm ? 1 : 0, missKm: miss, sigmaMajorKm: Math.sqrt(Math.max(l1, 0)), sigmaMinorKm: Math.sqrt(Math.max(l2, 0)) };
  const sx = Math.sqrt(l1), sy = Math.sqrt(l2);
  // Miss vector (miss, 0) expressed in the principal axes.
  const mx = miss * Math.cos(theta);
  const my = -miss * Math.sin(theta);
  e1 = null;

  // Integrate over the circle with x = R sin(t), smooth integrand -> Simpson converges fast.
  const R = hbrKm;
  const n = 200;
  const h = Math.PI / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const t = -Math.PI / 2 + i * h;
    const x = R * Math.sin(t);
    const half = R * Math.cos(t);
    const gx = Math.exp(-((x - mx) * (x - mx)) / (2 * l1)) / (Math.sqrt(2 * Math.PI) * sx);
    const py = normInterval((-half - my) / sy, (half - my) / sy);
    const f = gx * py * R * Math.cos(t);
    sum += f * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
  }
  const pc = Math.min(1, Math.max(0, (sum * h) / 3));
  return { pc, missKm: miss, sigmaMajorKm: sx, sigmaMinorKm: sy };
};

// Position uncertainty assumed for a TLE-derived state, growing with the age of the TLE.
// Typical published LEO TLE accuracy: ~0.1-0.2 km radial, ~0.5-1 km along-track at epoch,
// with along-track error growing ~1 km/day. Used only when no CDM covariance is available.
const tleSigmaRtn = (ageDays) => {
  const a = Math.min(Math.abs(ageDays || 0), 10);
  return { r: 0.2 + 0.1 * a, t: 0.6 + 1.2 * a, n: 0.25 + 0.1 * a };
};

// Covariance assumed for the operator's own twin when it is the idealised circular model.
const DESIGN_SIGMA = { r: 0.05, t: 0.05, n: 0.05 };

const hbrKm = () => (Number(process.env.PC_HBR_M) || 15) / 1000;

/**
 * Estimated Pc for a screening event when only TLEs are available.
 * s1/s2: {r, v} states at TCA of twin and object; age1/age2: TLE ages (days) or null for design orbits.
 */
const estimatePc = (s1, s2, age1, age2) => {
  const sg1 = age1 == null ? DESIGN_SIGMA : tleSigmaRtn(age1);
  const sg2 = age2 == null ? DESIGN_SIGMA : tleSigmaRtn(age2);
  const c1 = O.covRtnToInertial(O.diagCov(sg1.r, sg1.t, sg1.n), s1.r, s1.v);
  const c2 = O.covRtnToInertial(O.diagCov(sg2.r, sg2.t, sg2.n), s2.r, s2.v);
  const res = foster(O.sub(s2.r, s1.r), O.sub(s2.v, s1.v), O.addCov(c1, c2), hbrKm());
  return { ...res, method: 'Foster 2D, covariance estimated from TLE age' };
};

module.exports = { foster, estimatePc, tleSigmaRtn, hbrKm, erfc, Q, normInterval };
