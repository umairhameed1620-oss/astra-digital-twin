// Frames (J2000/ITRF -> TEME), CCSDS OEM parsing, interpolation and covariance handling.
process.env.TZ = 'UTC';
const satellite = require('satellite.js');
const F = require('../../lib/frames');
const OEM = require('../../lib/oem');
const O = require('../../lib/orbit');
const T = require('../../lib/tle');

const fix = (l) => l.slice(0, 68) + T.checksum(l);
const L1 = fix('1 25544U 98067A   26298.50000000  .00016717  00000-0  30000-3 0  9990');
const L2 = fix('2 25544  51.6400 120.0000 0004000  90.0000 270.0000 15.50000000400000');
const EPOCH = Date.UTC(2026, 0, 1) + (298.5 - 1) * 86400000;
const sgp = O.stateFn({ kind: 'tle', l1: L1, l2: L2 });
const arr = (p) => [p.x, p.y, p.z];
const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
const transpose = (M) => M[0].map((_, i) => M.map((r) => r[i]));
const apply = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);

const makeOem = (frame, { stepSec = 60, hours = 6, cov = '' } = {}) => {
  const lines = ['CCSDS_OEM_VERS = 2.0', 'CREATION_DATE = 2026-10-25T12:00:00', 'ORIGINATOR = TEST', '', 'META_START',
    'OBJECT_NAME = TESTSAT', 'OBJECT_ID = 1998-067A', 'CENTER_NAME = EARTH', `REF_FRAME = ${frame}`, 'TIME_SYSTEM = UTC',
    `START_TIME = ${iso(EPOCH)}`, `STOP_TIME = ${iso(EPOCH + hours * 3600000)}`, 'META_STOP', ''];
  for (let ms = EPOCH; ms <= EPOCH + hours * 3600000; ms += stepSec * 1000) {
    const s = sgp(ms);
    let r = arr(s.r); let v = arr(s.v);
    if (frame === 'EME2000') { const M = transpose(F.j2000ToTemeMatrix(ms)); r = apply(M, r); v = apply(M, v); }
    if (frame === 'ITRF') {
      const g = satellite.gstime(new Date(ms));
      const e = satellite.eciToEcf(s.r, g);
      const w = 7.292115146706979e-5;
      const ve = satellite.eciToEcf(s.v, g);
      r = [e.x, e.y, e.z]; v = [ve.x + w * e.y, ve.y - w * e.x, ve.z];
    }
    lines.push(`${iso(ms)} ${r.map((x) => x.toFixed(6)).join(' ')} ${v.map((x) => x.toFixed(9)).join(' ')}`);
  }
  if (cov) lines.push(cov);
  return lines.join('\n');
};

describe('reference frames', () => {
  test('EME2000 -> TEME matches Vallado (2006) to within 5 m', () => {
    const ms = Date.UTC(2004, 3, 6, 7, 51, 28, 386);
    const o = F.toTeme('EME2000', ms, [5102.5089579, 6123.0114007, 6378.1369282], [-4.743220157, 0.790536497, 5.533755727]);
    const ref = [5094.1801621, 6127.6446595, 6380.3445327];
    expect(Math.hypot(...o.r.map((x, i) => x - ref[i])) * 1000).toBeLessThan(5);
    expect(o.v[0]).toBeCloseTo(-4.746131487, 5);
  });
  test('unknown frames are rejected', () => {
    expect(() => F.toTeme('MOD', 0, [7000, 0, 0], [0, 7.5, 0])).toThrow(/not supported/);
  });
});

describe('OEM parsing and interpolation', () => {
  const at = EPOCH + 2 * 3600000 + 17 * 1000; // between samples
  const truth = sgp(at);

  test.each(['TEME', 'EME2000', 'ITRF'])('%s ephemeris interpolates to the SGP4 truth within 5 m', (frame) => {
    const eph = OEM.parse(makeOem(frame));
    expect(eph.t.length).toBe(361);
    expect(eph.sourceFrame).toBe(frame);
    const s = OEM.interpolator(eph)(at);
    expect(O.norm(O.sub(s.r, truth.r)) * 1000).toBeLessThan(5);
    expect(O.norm(O.sub(s.v, truth.v)) * 1000).toBeLessThan(0.05); // m/s
  });

  test('returns null outside the span and works as a twin model with TLE fallback', () => {
    const eph = OEM.parse(makeOem('TEME', { hours: 2 }));
    expect(OEM.interpolator(eph)(EPOCH - 60000)).toBeNull();
    const model = O.twinModel({ id: 'x', config: {}, tle_line1: L1, tle_line2: L2, ephemeris: { id: 'e', ...eph } });
    expect(model.kind).toBe('ephemeris');
    const f = O.stateFn(model);
    expect(f(EPOCH + 5 * 3600000)).not.toBeNull(); // falls back to the TLE after the ephemeris ends
    const el = O.describe(model);
    expect(el.inclinationDeg).toBeCloseTo(51.64, 0);
  });

  test('RTN covariance is read; inertial covariance is rotated to RTN', () => {
    const rtn = ['COVARIANCE_START', `EPOCH = ${iso(EPOCH)}`, 'COV_REF_FRAME = RTN',
      '1.0e-4', '0 4.0e-2', '0 0 2.5e-3', '0 0 0 1e-8', '0 0 0 0 1e-8', '0 0 0 0 0 1e-8', 'COVARIANCE_STOP'].join('\n');
    const a = OEM.parse(makeOem('TEME', { cov: rtn }));
    const s = OEM.sigmaAt(a, EPOCH);
    expect(s.r).toBeCloseTo(0.01, 6); expect(s.t).toBeCloseTo(0.2, 6); expect(s.n).toBeCloseTo(0.05, 6);
    expect(s.source).toBe('OEM covariance');

    // the same covariance expressed in the inertial frame comes back as the RTN diagonal
    const st = sgp(EPOCH);
    const { R, T: Tt, N } = O.rtnBasis(st.r, st.v);
    const M = [[R.x, Tt.x, N.x], [R.y, Tt.y, N.y], [R.z, Tt.z, N.z]];
    const D = [[1e-4, 0, 0], [0, 4e-2, 0], [0, 0, 2.5e-3]];
    const C = M.map((row, i) => [0, 1, 2].map((j) => [0, 1, 2].reduce((acc, k) => acc + row[k] * D[k][k] * M[j][k], 0)));
    const lower = [C[0][0], C[1][0], C[1][1], C[2][0], C[2][1], C[2][2]].map((x) => x.toExponential(12));
    const inert = ['COVARIANCE_START', `EPOCH = ${iso(EPOCH)}`, 'COV_REF_FRAME = TEME', lower[0], `${lower[1]} ${lower[2]}`, `${lower[3]} ${lower[4]} ${lower[5]}`,
      '0 0 0 1e-8', '0 0 0 0 1e-8', '0 0 0 0 0 1e-8', 'COVARIANCE_STOP'].join('\n');
    const b = OEM.parse(makeOem('TEME', { cov: inert }));
    const sb = OEM.sigmaAt(b, EPOCH);
    expect(sb.t).toBeCloseTo(0.2, 4); expect(sb.r).toBeCloseTo(0.01, 4);
  });

  test('without covariance a documented default is used', () => {
    const s = OEM.sigmaAt(OEM.parse(makeOem('TEME')), EPOCH);
    expect(s.source).toMatch(/assumed/);
  });

  test('XML OEM is accepted', () => {
    const states = [];
    for (let i = 0; i < 10; i++) {
      const ms = EPOCH + i * 60000; const s = sgp(ms);
      states.push(`<stateVector><EPOCH>${iso(ms)}</EPOCH><X>${s.r.x}</X><Y>${s.r.y}</Y><Z>${s.r.z}</Z><X_DOT>${s.v.x}</X_DOT><Y_DOT>${s.v.y}</Y_DOT><Z_DOT>${s.v.z}</Z_DOT></stateVector>`);
    }
    const xml = `<?xml version="1.0"?><oem><body><segment><metadata><OBJECT_NAME>X</OBJECT_NAME><OBJECT_ID>1</OBJECT_ID><CENTER_NAME>EARTH</CENTER_NAME><REF_FRAME>TEME</REF_FRAME><TIME_SYSTEM>UTC</TIME_SYSTEM></metadata><data>${states.join('')}</data></segment></body></oem>`;
    expect(OEM.parse(xml).t.length).toBe(10);
  });

  test('GPS time system is shifted to UTC', () => {
    const txt = makeOem('TEME').replace('TIME_SYSTEM = UTC', 'TIME_SYSTEM = GPS');
    expect(OEM.parse(txt).t[0]).toBe(EPOCH - 18000);
  });

  test('bad input is rejected with a clear message', () => {
    expect(() => OEM.parse('hello')).toThrow(/No OEM segment/);
    expect(() => OEM.parse(makeOem('TEME').replace('CENTER_NAME = EARTH', 'CENTER_NAME = MOON'))).toThrow(/CENTER_NAME/);
    expect(() => OEM.parse(makeOem('TEME').replace('REF_FRAME = TEME', 'REF_FRAME = MOD'))).toThrow(/REF_FRAME/);
    expect(() => OEM.parse(makeOem('TEME', { stepSec: 3600, hours: 12 }))).toThrow(/Gap of/);
    const metres = makeOem('TEME').replace(/^(\S+T\S+) (\S+)/gm, (m, t, x) => `${t} ${Number(x) * 1000}`);
    expect(() => OEM.parse(metres)).toThrow(/units/);
  });
});
