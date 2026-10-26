// TLE parsing, validation and lookup by NORAD catalogue number (CelesTrak GP data).
const O = require('./orbit');
const { getJson, getText } = require('./net');

const checksum = (line) => {
  let c = 0;
  for (const ch of line.slice(0, 68)) {
    if (ch >= '0' && ch <= '9') c += Number(ch);
    else if (ch === '-') c += 1;
  }
  return c % 10;
};

// Parse a block of 2-line or 3-line element sets.
const parseTle = (text) => {
  const lines = String(text).split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const l1 = lines[i];
    const l2 = lines[i + 1];
    if (!(l1.startsWith('1 ') && l2.startsWith('2 '))) continue;
    const prev = i > 0 ? lines[i - 1] : '';
    const norad = l1.slice(2, 7).trim();
    const name = prev && !prev.startsWith('1 ') && !prev.startsWith('2 ') ? prev.replace(/^0 /, '').trim() : `NORAD ${norad}`;
    out.push({ name, norad, l1, l2 });
    i++;
  }
  return out;
};

// Throws a descriptive error if the element set is malformed.
const validate = (l1, l2) => {
  const a = String(l1 || '').trimEnd();
  const b = String(l2 || '').trimEnd();
  if (a.length !== 69 || b.length !== 69) throw new Error('Each TLE line must be exactly 69 characters');
  if (!a.startsWith('1 ') || !b.startsWith('2 ')) throw new Error('Line 1 must start with "1 " and line 2 with "2 "');
  if (a.slice(2, 7) !== b.slice(2, 7)) throw new Error('Catalogue numbers on line 1 and line 2 do not match');
  if (checksum(a) !== Number(a[68])) throw new Error('Line 1 checksum is wrong');
  if (checksum(b) !== Number(b[68])) throw new Error('Line 2 checksum is wrong');
  const rec = O.satrec(a, b);
  const st = O.sgp4State(rec, O.tleEpochMs(rec));
  if (!st) throw new Error('SGP4 could not propagate this element set');
  const alt = O.norm(st.r) - O.RE;
  if (alt < 100 || alt > 50000) throw new Error(`Orbit altitude ${alt.toFixed(0)} km is outside the supported range`);
  return { l1: a, l2: b, norad: Number(a.slice(2, 7)), epoch: new Date(O.tleEpochMs(rec)) };
};

const cache = new Map(); // norad -> {at, data}
const TTL = 2 * 3600 * 1000;

/**
 * Latest element set for a NORAD ID. Uses the screening catalogue if it is already loaded,
 * otherwise a single small CelesTrak request (cached for 2 hours).
 */
const byNorad = async (norad, catalogLookup) => {
  const id = Number(norad);
  if (!Number.isInteger(id) || id <= 0 || id > 999999999) throw new Error('NORAD ID must be a positive integer');
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  let found = catalogLookup ? catalogLookup(String(id)) : null;
  if (!found) {
    const txt = await getText(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${id}&FORMAT=tle`);
    if (/No GP data found/i.test(txt)) throw new Error(`NORAD ${id} not found on CelesTrak (decayed, classified, or not yet catalogued)`);
    found = parseTle(txt).find((t) => Number(t.norad) === id);
    if (!found) throw new Error(`CelesTrak returned no element set for NORAD ${id}`);
  }
  const v = validate(found.l1, found.l2);
  const data = { ...v, name: found.name, source: 'celestrak' };
  cache.set(id, { at: Date.now(), data });
  return data;
};

module.exports = { parseTle, validate, byNorad, checksum, getJson };
