// CCSDS Orbit Ephemeris Message (OEM, CCSDS 502.0-B) — KVN and XML.
// Operators produce these from their own orbit determination (usually GPS), which is far more accurate than
// a public TLE. ASTRA converts the states to TEME, interpolates them (Lagrange, 8 points) and uses the optional
// covariance for collision probability.
const F = require('./frames');

const MAX_POINTS = Number(process.env.OEM_MAX_POINTS) || 50000;
const LAGRANGE_N = 8;
// Used when the OEM has no covariance: typical predicted accuracy of a GPS-based operator ephemeris.
const DEFAULT_SIGMA_KM = { r: 0.03, t: 0.1, n: 0.03 };

// Offset to subtract from the stated time to get UTC (seconds).
const TIME_OFFSETS = { UTC: 0, GPS: 18, TAI: 37, TT: 69.184 };

const parseEpoch = (s, timeSystem) => {
  let t = String(s || '').trim();
  const doy = t.match(/^(\d{4})-(\d{3})T(.*)$/);
  if (doy) {
    const d = new Date(Date.UTC(Number(doy[1]), 0, 1));
    d.setUTCDate(Number(doy[2]));
    t = `${d.toISOString().slice(0, 10)}T${doy[3]}`;
  }
  if (!/[zZ]$/.test(t)) t += 'Z';
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) throw new Error(`Invalid epoch "${s}"`);
  return ms - (TIME_OFFSETS[timeSystem] || 0) * 1000;
};

const num = (x) => { const n = Number(String(x).replace(/\[.*?\]/g, '')); if (!Number.isFinite(n)) throw new Error(`Invalid number "${x}"`); return n; };

// ---- readers -> [{ meta, states: [{epoch, r, v}], covs: [{epoch, frame, m(6x6 lower)}] }] ----
const readKvn = (text) => {
  const segments = [];
  let seg = null; let mode = 'header'; let cov = null; let covVals = [];
  const flushCov = () => {
    if (cov && covVals.length) {
      if (covVals.length < 21) throw new Error('Covariance block has fewer than 21 values');
      cov.m = covVals.slice(0, 21); seg.covs.push(cov);
    }
    cov = null; covVals = [];
  };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('COMMENT')) continue;
    if (line === 'META_START') { seg = { meta: {}, states: [], covs: [] }; segments.push(seg); mode = 'meta'; continue; }
    if (line === 'META_STOP') { mode = 'data'; continue; }
    if (line === 'COVARIANCE_START') { mode = 'cov'; continue; }
    if (line === 'COVARIANCE_STOP') { flushCov(); mode = 'data'; continue; }
    const kv = line.match(/^([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
    if (mode === 'meta' && kv) { seg.meta[kv[1]] = kv[2]; continue; }
    if (mode === 'header') continue;
    if (mode === 'cov') {
      if (kv && kv[1] === 'EPOCH') { flushCov(); cov = { epoch: kv[2], frame: null }; continue; }
      if (kv && kv[1] === 'COV_REF_FRAME') { if (cov) cov.frame = kv[2]; continue; }
      if (cov) covVals.push(...line.split(/\s+/).map(num));
      continue;
    }
    if (mode === 'data' && seg) {
      const p = line.split(/\s+/);
      if (p.length >= 7 && /^\d{4}-/.test(p[0])) {
        const n = p.slice(1, 7).map(num);
        seg.states.push({ epoch: p[0], r: n.slice(0, 3), v: n.slice(3, 6) });
      }
    }
  }
  return segments;
};

const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`, 'i')); return m ? m[1].trim() : null; };

const readXml = (text) => {
  const segments = [];
  for (const sm of String(text).matchAll(/<segment[\s>][\s\S]*?<\/segment>/gi)) {
    const s = sm[0];
    const metaXml = (s.match(/<metadata[\s>][\s\S]*?<\/metadata>/i) || [''])[0];
    const meta = {};
    for (const k of ['OBJECT_NAME', 'OBJECT_ID', 'CENTER_NAME', 'REF_FRAME', 'TIME_SYSTEM', 'START_TIME', 'STOP_TIME']) { const v = tag(metaXml, k); if (v != null) meta[k] = v; }
    const states = [];
    for (const sv of s.matchAll(/<stateVector[\s>][\s\S]*?<\/stateVector>/gi)) {
      const x = sv[0];
      states.push({ epoch: tag(x, 'EPOCH'), r: ['X', 'Y', 'Z'].map((k) => num(tag(x, k))), v: ['X_DOT', 'Y_DOT', 'Z_DOT'].map((k) => num(tag(x, k))) });
    }
    const covs = [];
    const keys = ['CX_X', 'CY_X', 'CY_Y', 'CZ_X', 'CZ_Y', 'CZ_Z', 'CX_DOT_X', 'CX_DOT_Y', 'CX_DOT_Z', 'CX_DOT_X_DOT',
      'CY_DOT_X', 'CY_DOT_Y', 'CY_DOT_Z', 'CY_DOT_X_DOT', 'CY_DOT_Y_DOT', 'CZ_DOT_X', 'CZ_DOT_Y', 'CZ_DOT_Z', 'CZ_DOT_X_DOT', 'CZ_DOT_Y_DOT', 'CZ_DOT_Z_DOT'];
    for (const cm of s.matchAll(/<covarianceMatrix[\s>][\s\S]*?<\/covarianceMatrix>/gi)) {
      const x = cm[0];
      const vals = keys.map((k) => tag(x, k));
      if (vals.slice(0, 6).every((v) => v != null)) covs.push({ epoch: tag(x, 'EPOCH'), frame: tag(x, 'COV_REF_FRAME'), m: vals.map((v) => (v == null ? 0 : num(v))) });
    }
    segments.push({ meta, states, covs });
  }
  return segments;
};

// Position part (3x3) of a 6x6 lower-triangular covariance [r0c0, r1c0, r1c1, r2c0, r2c1, r2c2, ...].
const pos3 = (m) => [[m[0], m[1], m[3]], [m[1], m[2], m[4]], [m[3], m[4], m[5]]];
const isRtnFrame = (f) => /^(RTN|RSW|RIC|QSW|LVLH_RTN|UVW)$/i.test(String(f || '').trim());

const rotToRtn = (C, r, v) => {
  // rows of M = R, T, N unit vectors; C_rtn = M C M^T
  const nrm = (a) => Math.hypot(a[0], a[1], a[2]);
  const R = r.map((x) => x / nrm(r));
  const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]];
  const N = h.map((x) => x / nrm(h));
  const T = [N[1] * R[2] - N[2] * R[1], N[2] * R[0] - N[0] * R[2], N[0] * R[1] - N[1] * R[0]];
  const M = [R, T, N];
  const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) s += M[i][k] * C[k][l] * M[j][l];
    out[i][j] = s;
  }
  return out;
};

/**
 * Parse an OEM and return { objectName, objectId, sourceFrame, timeSystem, t:[ms], r:[[km]], v:[[km/s]] (TEME),
 * cov: [{ t, rtn:[[km^2]] }] }.
 */
const parse = (content) => {
  const text = String(content || '').trim();
  if (!text) throw new Error('Empty file');
  const segments = text.startsWith('<') ? readXml(text) : readKvn(text);
  if (!segments.length) throw new Error('No OEM segment found (expected META_START ... META_STOP and state lines)');
  let objectName = null; let objectId = null; let sourceFrame = null; let timeSystem = null;
  const pts = []; const covs = [];
  for (const seg of segments) {
    const m = seg.meta;
    const center = String(m.CENTER_NAME || 'EARTH').toUpperCase();
    if (center !== 'EARTH') throw new Error(`CENTER_NAME ${center} is not supported (Earth-centred ephemerides only)`);
    const ts = String(m.TIME_SYSTEM || 'UTC').toUpperCase();
    if (!(ts in TIME_OFFSETS)) throw new Error(`TIME_SYSTEM ${ts} is not supported (use UTC, GPS, TAI or TT)`);
    const frame = m.REF_FRAME || 'EME2000';
    if (!F.family(frame)) throw new Error(`REF_FRAME ${frame} is not supported (use EME2000, GCRF, ITRF or TEME)`);
    objectName = objectName || m.OBJECT_NAME || null;
    objectId = objectId || m.OBJECT_ID || null;
    sourceFrame = sourceFrame || frame;
    timeSystem = timeSystem || ts;
    for (const s of seg.states) {
      const ms = parseEpoch(s.epoch, ts);
      const te = F.toTeme(frame, ms, s.r, s.v);
      pts.push({ t: ms, r: te.r, v: te.v });
      if (pts.length > MAX_POINTS) throw new Error(`Too many state vectors (maximum ${MAX_POINTS})`);
    }
    for (const c of seg.covs) {
      const ms = parseEpoch(c.epoch, ts);
      let C = pos3(c.m);
      if (!isRtnFrame(c.frame)) {
        const cf = c.frame || frame;
        // Rotate into the inertial frame first for Earth-fixed covariance, then into RTN at the nearest state.
        const near = pts.reduce((best, p) => (!best || Math.abs(p.t - ms) < Math.abs(best.t - ms) ? p : best), null);
        if (!near) continue;
        if (F.family(cf) === 'ITRF') {
          const ex = F.toTeme('ITRF', ms, [1, 0, 0], [0, 0, 0]).r; const ey = F.toTeme('ITRF', ms, [0, 1, 0], [0, 0, 0]).r; const ez = F.toTeme('ITRF', ms, [0, 0, 1], [0, 0, 0]).r;
          const Mx = [[ex[0], ey[0], ez[0]], [ex[1], ey[1], ez[1]], [ex[2], ey[2], ez[2]]];
          const t = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) s += Mx[i][k] * C[k][l] * Mx[j][l]; t[i][j] = s; }
          C = t;
        }
        C = rotToRtn(C, near.r, near.v);
      }
      if (![0, 1, 2].every((i) => C[i][i] > 0)) throw new Error('Covariance has a non-positive variance');
      covs.push({ t: ms, rtn: C });
    }
  }
  if (pts.length < LAGRANGE_N) throw new Error(`At least ${LAGRANGE_N} state vectors are needed (found ${pts.length})`);
  pts.sort((a, b) => a.t - b.t);
  const uniq = pts.filter((p, i) => i === 0 || p.t > pts[i - 1].t);
  for (const p of uniq) {
    const rr = Math.hypot(...p.r);
    if (rr < 6478 || rr > 60000) throw new Error('A state vector is not a valid Earth orbit (check the units are km and km/s)');
  }
  const gaps = uniq.slice(1).map((p, i) => p.t - uniq[i].t);
  const maxGap = Math.max(...gaps);
  if (maxGap > 30 * 60 * 1000) throw new Error(`Gap of ${(maxGap / 60000).toFixed(0)} minutes between states; use a step of 10 minutes or less`);
  covs.sort((a, b) => a.t - b.t);
  return {
    objectName, objectId, sourceFrame: String(sourceFrame).toUpperCase(), timeSystem,
    t: uniq.map((p) => p.t), r: uniq.map((p) => p.r), v: uniq.map((p) => p.v), cov: covs,
    stepSec: Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length / 1000),
  };
};

// Index of the last sample at or before ms.
const bracket = (t, ms) => {
  let lo = 0; let hi = t.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid] <= ms) lo = mid; else hi = mid; }
  return lo;
};

/** ms -> { r:{x,y,z}, v:{x,y,z} } in TEME, or null outside the ephemeris span. */
const interpolator = (eph) => {
  const { t, r, v } = eph;
  const n = t.length;
  return (ms) => {
    if (ms < t[0] || ms > t[n - 1]) return null;
    const i = bracket(t, ms);
    let s = Math.max(0, i - LAGRANGE_N / 2 + 1);
    s = Math.min(s, n - LAGRANGE_N);
    const out = [0, 0, 0, 0, 0, 0];
    for (let j = s; j < s + LAGRANGE_N; j++) {
      let w = 1;
      for (let k = s; k < s + LAGRANGE_N; k++) if (k !== j) w *= (ms - t[k]) / (t[j] - t[k]);
      out[0] += w * r[j][0]; out[1] += w * r[j][1]; out[2] += w * r[j][2];
      out[3] += w * v[j][0]; out[4] += w * v[j][1]; out[5] += w * v[j][2];
    }
    return { r: { x: out[0], y: out[1], z: out[2] }, v: { x: out[3], y: out[4], z: out[5] } };
  };
};

/** Position sigma (km) in RTN at ms: from the nearest OEM covariance, otherwise the default for operator ephemerides. */
const sigmaAt = (eph, ms) => {
  if (eph.cov && eph.cov.length) {
    const c = eph.cov[Math.min(eph.cov.length - 1, Math.max(0, bracket(eph.cov.map((x) => x.t), ms)))];
    return { r: Math.sqrt(c.rtn[0][0]), t: Math.sqrt(c.rtn[1][1]), n: Math.sqrt(c.rtn[2][2]), source: 'OEM covariance' };
  }
  return { ...DEFAULT_SIGMA_KM, source: 'assumed (no covariance in the OEM)' };
};

module.exports = { parse, interpolator, sigmaAt, DEFAULT_SIGMA_KM, LAGRANGE_N };
