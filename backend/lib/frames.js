// Reference-frame conversions to TEME, the frame SGP4 (and so the whole ASTRA catalogue) works in.
//   EME2000 / J2000 / GCRF / ICRF -> TEME: IAU-1976 precession + IAU-1980 nutation (largest terms) + equation of equinoxes.
//   ITRF / ECEF / ITRF2014 ... -> TEME: rotation by GMST (polar motion ignored, < 15 m).
// Accuracy: tens of metres at LEO, well inside TLE and screening uncertainty. Verified against Vallado's
// published J2000/TEME example in tests/unit/oem.test.js.
const satellite = require('satellite.js');

const AS2R = Math.PI / (180 * 3600);
const D2R = Math.PI / 180;
const TT_MINUS_UTC_S = Number(process.env.TT_MINUS_UTC_S) || 69.184; // 37 leap seconds + 32.184 s
const OMEGA_EARTH = 7.292115146706979e-5; // rad/s

// Frame rotations (passive), as in Vallado: ROT1/ROT2/ROT3.
const rot1 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; };
const rot2 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, -s], [0, 1, 0], [s, 0, c]]; };
const rot3 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; };
const mul = (A, B) => A.map((r, i) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const apply = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];

// IAU-1980 nutation, the 13 largest terms (coefficients in 0.0001 arcsec): [l, l', F, D, Om, dpsi, dpsi_t, deps, deps_t]
const NUT = [
  [0, 0, 0, 0, 1, -171996, -174.2, 92025, 8.9],
  [0, 0, 2, -2, 2, -13187, -1.6, 5736, -3.1],
  [0, 0, 2, 0, 2, -2274, -0.2, 977, -0.5],
  [0, 0, 0, 0, 2, 2062, 0.2, -895, 0.5],
  [0, 1, 0, 0, 0, 1426, -3.4, 54, -0.1],
  [1, 0, 0, 0, 0, 712, 0.1, -7, 0],
  [0, 1, 2, -2, 2, -517, 1.2, 224, -0.6],
  [0, 0, 2, 0, 1, -386, -0.4, 200, 0],
  [1, 0, 2, 0, 2, -301, 0, 129, -0.1],
  [0, -1, 2, -2, 2, 217, -0.5, -95, 0.3],
  [1, 0, 0, -2, 0, -158, 0, -1, 0],
  [0, 0, 2, -2, 1, 129, 0.1, -70, 0],
  [-1, 0, 2, 0, 2, 123, 0, -53, 0],
];

const centuriesTT = (ms) => ((ms + TT_MINUS_UTC_S * 1000) / 86400000 + 2440587.5 - 2451545.0) / 36525;

/** Rotation matrix taking an EME2000 vector to TEME at UTC time `ms`. */
const j2000ToTemeMatrix = (ms) => {
  const T = centuriesTT(ms);
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * AS2R;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * AS2R;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * AS2R;
  const P = mul(rot3(-z), mul(rot2(theta), rot3(-zeta)));

  const l = (134.96298139 + 477198.8673981 * T) * D2R;
  const lp = (357.52772333 + 35999.05034 * T) * D2R;
  const F = (93.27191028 + 483202.0175381 * T) * D2R;
  const D = (297.85036306 + 445267.11148 * T) * D2R;
  const Om = (125.04452222 - 1934.1362608 * T) * D2R;
  let dpsi = 0; let deps = 0;
  for (const [a, b, c, d, e, s0, s1, c0, c1] of NUT) {
    const arg = a * l + b * lp + c * F + d * D + e * Om;
    dpsi += (s0 + s1 * T) * Math.sin(arg);
    deps += (c0 + c1 * T) * Math.cos(arg);
  }
  dpsi *= 1e-4 * AS2R; deps *= 1e-4 * AS2R;
  const epsBar = (84381.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T ** 3) * AS2R;
  const eps = epsBar + deps;
  const N = mul(rot1(-eps), mul(rot3(-dpsi), rot1(epsBar)));
  const eqe = dpsi * Math.cos(epsBar) + (0.00264 * Math.sin(Om) + 0.000063 * Math.sin(2 * Om)) * AS2R;
  return mul(rot3(eqe), mul(N, P)); // TOD -> TEME is a rotation by the equation of the equinoxes
};

const FRAMES = {
  TEME: 'TEME', EME2000: 'J2000', J2000: 'J2000', GCRF: 'J2000', ICRF: 'J2000',
  ITRF: 'ITRF', ITRF93: 'ITRF', ITRF97: 'ITRF', ITRF2000: 'ITRF', ITRF2005: 'ITRF', ITRF2008: 'ITRF', ITRF2014: 'ITRF', ITRF2020: 'ITRF',
  ECEF: 'ITRF', EFG: 'ITRF', ECF: 'ITRF',
};
const family = (frame) => FRAMES[String(frame || '').toUpperCase().replace(/[\s-]/g, '')] || null;

/** Convert a state (km, km/s, arrays) from `frame` to TEME at UTC `ms`. */
const toTeme = (frame, ms, r, v) => {
  const f = family(frame);
  if (f === 'TEME') return { r, v };
  if (f === 'J2000') {
    const M = j2000ToTemeMatrix(ms);
    return { r: apply(M, r), v: apply(M, v) };
  }
  if (f === 'ITRF') {
    const g = satellite.gstime(new Date(ms));
    const M = rot3(-g);
    // inertial velocity = Earth-fixed velocity + omega x r
    const vin = [v[0] - OMEGA_EARTH * r[1], v[1] + OMEGA_EARTH * r[0], v[2]];
    return { r: apply(M, r), v: apply(M, vin) };
  }
  throw new Error(`Reference frame ${frame} is not supported (use EME2000, GCRF, ITRF or TEME)`);
};

module.exports = { toTeme, j2000ToTemeMatrix, family, FRAMES };
