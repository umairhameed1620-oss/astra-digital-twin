// Conjunction Data Message (CCSDS 508.0) parsing and Foster Pc recomputation.
// Accepts KVN text, XML, or JSON (Space-Track `cdm_public` rows or KVN-style key/value objects).
const crypto = require('crypto');
const O = require('./orbit');
const PC = require('./pc');

const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/\[.*?\]/g, '').trim());
  return Number.isFinite(n) ? n : null;
};

const parseTime = (v) => {
  if (!v) return null;
  let s = String(v).trim();
  // CCSDS allows day-of-year form 2026-300T12:00:00
  const doy = s.match(/^(\d{4})-(\d{3})T(.*)$/);
  if (doy) {
    const d = new Date(Date.UTC(Number(doy[1]), 0, 1));
    d.setUTCDate(Number(doy[2]));
    s = `${d.toISOString().slice(0, 10)}T${doy[3]}`;
  }
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z';
  const t = Date.parse(s.replace(' ', 'T'));
  return Number.isFinite(t) ? t : null;
};

// ---------- format readers -> { header: {}, obj: [ {}, {} ] } ----------
const readKvn = (text) => {
  const out = { header: {}, obj: [] };
  let cur = out.header;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('COMMENT')) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*?)\s*(\[[^\]]*\])?$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2];
    if (key === 'OBJECT') {
      cur = { OBJECT: val };
      out.obj.push(cur);
      continue;
    }
    cur[key] = val;
  }
  return out;
};

const readXml = (text) => {
  const out = { header: {}, obj: [] };
  let cur = out.header;
  const re = /<([A-Za-z_][A-Za-z0-9_]*)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
  let m;
  while ((m = re.exec(text))) {
    const key = m[1].toUpperCase();
    const val = m[2].trim();
    if (key === 'OBJECT') {
      cur = { OBJECT: val };
      out.obj.push(cur);
      continue;
    }
    cur[key] = val;
  }
  return out;
};

const pick = (o, ...keys) => {
  for (const k of keys) {
    const hit = Object.keys(o).find((x) => x.toUpperCase() === k);
    if (hit !== undefined && o[hit] !== null && o[hit] !== '') return o[hit];
  }
  return null;
};

// Space-Track cdm_public row -> normalised CDM (no covariance in the public product).
const fromSpaceTrackRow = (r) => ({
  cdmId: String(pick(r, 'CDM_ID', 'MESSAGE_ID') || ''),
  created: parseTime(pick(r, 'CREATED', 'CREATION_DATE')),
  tca: parseTime(pick(r, 'TCA')),
  missKm: (() => { const m = num(pick(r, 'MIN_RNG', 'MISS_DISTANCE')); return m == null ? null : m / 1000; })(),
  relSpeedKms: null,
  pcReported: num(pick(r, 'PC', 'COLLISION_PROBABILITY')),
  pcMethodReported: pick(r, 'COLLISION_PROBABILITY_METHOD') || 'Space-Track (CSpOC)',
  emergency: String(pick(r, 'EMERGENCY_REPORTABLE') || '').toUpperCase() === 'Y',
  obj: [
    { designator: String(pick(r, 'SAT_1_ID', 'SAT1_ID') || ''), name: pick(r, 'SAT_1_NAME', 'SAT1_NAME'), type: pick(r, 'SAT1_OBJECT_TYPE') },
    { designator: String(pick(r, 'SAT_2_ID', 'SAT2_ID') || ''), name: pick(r, 'SAT_2_NAME', 'SAT2_NAME'), type: pick(r, 'SAT2_OBJECT_TYPE') },
  ],
  relRtnKm: null,
  relVelRtnKms: null,
});

const objectFrom = (o) => {
  const state = ['X', 'Y', 'Z', 'X_DOT', 'Y_DOT', 'Z_DOT'].map((k) => num(o[k]));
  const covKeys = ['CR_R', 'CT_R', 'CT_T', 'CN_R', 'CN_T', 'CN_N'].map((k) => num(o[k]));
  const hasCov = covKeys.every((x) => x != null);
  const m2 = 1e-6; // m^2 -> km^2
  return {
    designator: String(o.OBJECT_DESIGNATOR || '').replace(/^0+/, ''),
    name: o.OBJECT_NAME || null,
    type: o.OBJECT_TYPE || null,
    state: state.every((x) => x != null) ? { r: O.v3(state[0], state[1], state[2]), v: O.v3(state[3], state[4], state[5]) } : null,
    covRtn: hasCov ? [
      [covKeys[0] * m2, covKeys[1] * m2, covKeys[3] * m2],
      [covKeys[1] * m2, covKeys[2] * m2, covKeys[4] * m2],
      [covKeys[3] * m2, covKeys[4] * m2, covKeys[5] * m2],
    ] : null,
  };
};

const fromRecord = ({ header: h, obj }) => {
  const rel = ['RELATIVE_POSITION_R', 'RELATIVE_POSITION_T', 'RELATIVE_POSITION_N'].map((k) => num(h[k]));
  const relv = ['RELATIVE_VELOCITY_R', 'RELATIVE_VELOCITY_T', 'RELATIVE_VELOCITY_N'].map((k) => num(h[k]));
  const miss = num(h.MISS_DISTANCE);
  const speed = num(h.RELATIVE_SPEED);
  return {
    cdmId: String(h.MESSAGE_ID || ''),
    created: parseTime(h.CREATION_DATE),
    tca: parseTime(h.TCA),
    missKm: miss == null ? null : miss / 1000,
    relSpeedKms: speed == null ? null : speed / 1000,
    pcReported: num(h.COLLISION_PROBABILITY),
    pcMethodReported: h.COLLISION_PROBABILITY_METHOD || null,
    emergency: false,
    obj: obj.slice(0, 2).map(objectFrom),
    relRtnKm: rel.every((x) => x != null) ? O.v3(rel[0] / 1000, rel[1] / 1000, rel[2] / 1000) : null,
    relVelRtnKms: relv.every((x) => x != null) ? O.v3(relv[0] / 1000, relv[1] / 1000, relv[2] / 1000) : null,
  };
};

/** Parse one or more CDMs from uploaded content. Returns an array of normalised CDMs. */
const parse = (content) => {
  const text = String(content || '').trim();
  if (!text) throw new Error('Empty CDM');
  let list;
  if (text.startsWith('{') || text.startsWith('[')) {
    const j = JSON.parse(text);
    const rows = Array.isArray(j) ? j : [j];
    list = rows.map((r) => (pick(r, 'SAT_1_ID', 'SAT1_ID') != null ? fromSpaceTrackRow(r) : fromRecord({ header: r, obj: r.objects || [] })));
  } else if (/<cdm[\s>]/i.test(text) || text.startsWith('<?xml')) {
    const parts = text.split(/<\/cdm>/i).filter((p) => /<cdm[\s>]/i.test(p));
    list = parts.map((p) => fromRecord(readXml(p)));
  } else {
    const parts = text.split(/(?=^CCSDS_CDM_VERS\s*=)/m).filter((p) => p.trim());
    list = parts.map((p) => fromRecord(readKvn(p)));
  }
  list = list.filter((c) => c.tca);
  if (!list.length) throw new Error('No valid CDM found (a TCA field is required)');
  return list.map((c) => ({
    ...c,
    cdmId: c.cdmId || crypto.createHash('sha1').update(JSON.stringify(c)).digest('hex').slice(0, 16),
  }));
};

/**
 * Recompute Pc with Foster's method from a CDM for the twin with NORAD `ownNorad` (optional).
 * Returns { pc, method, note, ownIndex, other }.
 */
const assess = (cdm, ownNorad) => {
  let own = 0;
  if (ownNorad && cdm.obj[1] && String(Number(cdm.obj[1].designator)) === String(Number(ownNorad))) own = 1;
  const other = cdm.obj[1 - own] || {};
  const a = cdm.obj[own] || {};
  const b = other;
  const hbr = PC.hbrKm();

  if (a.covRtn && b.covRtn) {
    if (a.state && b.state) {
      const cov = O.addCov(O.covRtnToInertial(a.covRtn, a.state.r, a.state.v), O.covRtnToInertial(b.covRtn, b.state.r, b.state.v));
      const res = PC.foster(O.sub(b.state.r, a.state.r), O.sub(b.state.v, a.state.v), cov, hbr);
      return { pc: res.pc, missKm: res.missKm, method: 'Foster 2D from CDM covariance and states', note: null, ownIndex: own, other };
    }
    if (cdm.relRtnKm && cdm.relVelRtnKms) {
      const rel = own === 0 ? cdm.relRtnKm : O.scale(cdm.relRtnKm, -1);
      const relv = own === 0 ? cdm.relVelRtnKms : O.scale(cdm.relVelRtnKms, -1);
      const res = PC.foster(rel, relv, O.addCov(a.covRtn, b.covRtn), hbr);
      return {
        pc: res.pc, missKm: res.missKm, method: 'Foster 2D from CDM covariance (relative RTN frame)',
        note: 'States not provided; both covariances treated as aligned with the primary RTN frame.', ownIndex: own, other,
      };
    }
  }
  return {
    pc: null, missKm: cdm.missKm, method: null,
    note: 'This CDM has no covariance (e.g. Space-Track public CDM). Showing the Pc reported by the issuer.', ownIndex: own, other,
  };
};

module.exports = { parse, assess, parseTime };
