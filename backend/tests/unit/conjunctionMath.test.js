// Unit tests for the collision-risk maths: Foster Pc, TLE validation, CDM parsing, manoeuvre physics.
process.env.PC_HBR_M = '15';
const O = require('../../lib/orbit');
const PC = require('../../lib/pc');
const T = require('../../lib/tle');
const CDM = require('../../lib/cdm');
const M = require('../../lib/manoeuvre');

const iso = (s) => [[s * s, 0, 0], [0, s * s, 0], [0, 0, s * s]];
const vz = O.v3(0, 0, 7.5);

describe('normal tails', () => {
  test('erfc matches reference values', () => {
    expect(PC.erfc(0)).toBeCloseTo(1, 6);
    expect(PC.erfc(1)).toBeCloseTo(0.157299207, 6);
    expect(PC.erfc(3) / 2.20904970e-5).toBeCloseTo(1, 5);
    expect(PC.erfc(-1)).toBeCloseTo(1.842700793, 6);
  });
  test('interval probability is accurate far in the tail', () => {
    const p = PC.normInterval(8, 8.001);
    const ref = 0.001 * Math.exp(-32) / Math.sqrt(2 * Math.PI);
    expect(p / ref).toBeGreaterThan(0.99);
    expect(p / ref).toBeLessThan(1.01);
  });
});

describe('Foster 2D probability of collision', () => {
  test('head-on with isotropic covariance matches the closed form 1 - exp(-R^2 / 2s^2)', () => {
    const R = 0.02, s = 0.05;
    const { pc } = PC.foster(O.v3(0, 0, 0), vz, iso(s), R);
    expect(pc).toBeCloseTo(1 - Math.exp(-(R * R) / (2 * s * s)), 6);
  });
  test('small hard-body radius matches the R^2/(2s^2) exp(-d^2/2s^2) approximation', () => {
    const R = 0.015, s = 0.5, d = 1.2;
    const { pc, missKm } = PC.foster(O.v3(d, 0, 0), vz, iso(s), R);
    expect(missKm).toBeCloseTo(d, 9);
    const approx = ((R * R) / (2 * s * s)) * Math.exp(-(d * d) / (2 * s * s));
    expect(pc / approx).toBeGreaterThan(0.995);
    expect(pc / approx).toBeLessThan(1.005);
  });
  test('the component of the miss vector along the relative velocity is ignored', () => {
    const a = PC.foster(O.v3(0.3, 0, 0), vz, iso(0.4), 0.015).pc;
    const b = PC.foster(O.v3(0.3, 0, 5), vz, iso(0.4), 0.015).pc;
    expect(b).toBeCloseTo(a, 12);
  });
  test('correlated covariance: rotating the geometry does not change Pc', () => {
    const c = [[0.04, 0.03, 0], [0.03, 0.09, 0], [0, 0, 1]];
    const p1 = PC.foster(O.v3(0.3, -0.2, 0), vz, c, 0.015).pc;
    // rotate everything 90 degrees about z
    const rot = (v) => O.v3(-v.y, v.x, v.z);
    const c2 = [[0.09, -0.03, 0], [-0.03, 0.04, 0], [0, 0, 1]];
    const p2 = PC.foster(rot(O.v3(0.3, -0.2, 0)), vz, c2, 0.015).pc;
    expect(p2).toBeCloseTo(p1, 12);
    expect(p1).toBeGreaterThan(1e-4);
    expect(p1).toBeLessThan(3e-4); // Monte Carlo reference ~1.85e-4
  });
  test('TLE uncertainty grows with age', () => {
    expect(PC.tleSigmaRtn(5).t).toBeGreaterThan(PC.tleSigmaRtn(0).t);
  });
});

describe('TLE validation', () => {
  const fix = (l) => l.slice(0, 68) + T.checksum(l);
  const l1 = fix('1 25544U 98067A   26298.50000000  .00016717  00000-0  30000-3 0  9990');
  const l2 = fix('2 25544  51.6400 120.0000 0004000  90.0000 270.0000 15.50000000400000');
  test('accepts a well-formed element set', () => {
    const v = T.validate(l1, l2);
    expect(v.norad).toBe(25544);
  });
  test('rejects a bad checksum', () => {
    const bad = l2.slice(0, 68) + ((Number(l2[68]) + 1) % 10);
    expect(() => T.validate(l1, bad)).toThrow(/checksum/);
  });
  test('rejects mismatched catalogue numbers', () => {
    const other = fix(`2 25545${l2.slice(7)}`);
    expect(() => T.validate(l1, other)).toThrow(/do not match/);
  });
  test('parses 3-line sets with names', () => {
    expect(T.parseTle(`ISS (ZARYA)\n${l1}\n${l2}`)[0]).toMatchObject({ name: 'ISS (ZARYA)', norad: '25544' });
  });
});

describe('CDM parsing', () => {
  const kvn = `CCSDS_CDM_VERS = 1.0
MESSAGE_ID = UNIT-1
TCA = 2026-300T12:00:00.000
MISS_DISTANCE = 210 [m]
RELATIVE_SPEED = 14200 [m/s]
RELATIVE_POSITION_R = 30.0 [m]
RELATIVE_POSITION_T = -50.0 [m]
RELATIVE_POSITION_N = 201.0 [m]
RELATIVE_VELOCITY_R = 5.0 [m/s]
RELATIVE_VELOCITY_T = -14000.0 [m/s]
RELATIVE_VELOCITY_N = 2300.0 [m/s]
COLLISION_PROBABILITY = 3.1E-04
OBJECT = OBJECT1
OBJECT_DESIGNATOR = 60001
CR_R = 900.0
CT_R = 0.0
CT_T = 40000.0
CN_R = 0.0
CN_T = 0.0
CN_N = 2500.0
OBJECT = OBJECT2
OBJECT_DESIGNATOR = 99999
OBJECT_NAME = DEBRIS
CR_R = 2500.0
CT_R = 0.0
CT_T = 250000.0
CN_R = 0.0
CN_T = 0.0
CN_N = 10000.0
`;
  test('reads KVN including day-of-year TCA and units', () => {
    const [c] = CDM.parse(kvn);
    expect(new Date(c.tca).toISOString()).toBe('2026-10-27T12:00:00.000Z');
    expect(c.missKm).toBeCloseTo(0.21, 6);
    expect(c.obj).toHaveLength(2);
    expect(c.obj[1].covRtn[1][1]).toBeCloseTo(0.25, 9); // 250000 m^2 -> km^2
  });
  test('recomputes Pc with Foster from the CDM covariance', () => {
    const a = CDM.assess(CDM.parse(kvn)[0], 60001);
    expect(a.pc).toBeGreaterThan(4.5e-3);
    expect(a.pc).toBeLessThan(5.1e-3); // hand calculation ~4.86e-3
    expect(a.other.designator).toBe('99999');
  });
  test('reads a Space-Track public CDM row and picks the other object', () => {
    const [c] = CDM.parse(JSON.stringify({ CDM_ID: '1', TCA: '2026-10-27T12:00:00', MIN_RNG: '850', PC: '2.3E-05', SAT_1_ID: '11111', SAT_1_NAME: 'DEB', SAT_2_ID: '60001', SAT_2_NAME: 'MINE' }));
    const a = CDM.assess(c, 60001);
    expect(c.missKm).toBeCloseTo(0.85, 6);
    expect(a.pc).toBeNull();
    expect(a.other.designator).toBe('11111');
  });
  test('rejects content without a TCA', () => {
    expect(() => CDM.parse('HELLO = WORLD')).toThrow(/No valid CDM/);
  });
});

describe('Manoeuvre physics', () => {
  test('Hohmann 550 -> 551 km needs ~0.27 m/s per burn', () => {
    const r1 = O.RE + 550;
    const h = M.hohmann(r1, r1 + 1);
    expect(h.dv1 * 1000).toBeCloseTo(0.274, 2);
    expect(h.dv2 * 1000).toBeCloseTo(0.274, 2);
    expect(h.transferSec / 60).toBeCloseTo(47.8, 0);
  });
  test('a small prograde burn shifts the along-track position by ~3*dv*t after several orbits', () => {
    const model = O.twinModel({ id: 'x', config: { altitude: 550, inclination: 53, raan: 0, trueAnomaly: 0 } });
    const fn = O.stateFn(model);
    const t0 = Date.UTC(2026, 9, 26);
    const dv = 0.1 / 1000; // km/s
    const t = 3 * (2 * Math.PI / model.n); // three orbits
    const d = M.deltaAt(fn, [{ ms: t0, dvRtn: { r: 0, t: dv, n: 0 } }], t0 + t * 1000);
    const shift = O.norm(d.dr);
    expect(shift / (3 * dv * t)).toBeGreaterThan(0.9);
    expect(shift / (3 * dv * t)).toBeLessThan(1.1);
  });
});
