// Validation maths: ASTRA closest approach vs a reference CDM, summary statistics and CSV export.
process.env.TZ = 'UTC';
const T = require('../../lib/tle');
const V = require('../../lib/validation');

const fix = (line) => line.slice(0, 68) + T.checksum(line);
const twin = { l1: fix('1 25544U 98067A   26298.50000000  .00016717  00000-0  30000-3 0  9990'), l2: fix('2 25544  51.6400 120.0000 0004000  90.0000 270.0000 15.50000000400000') };
// Same orbit with the node shifted by 0.1 deg: the two planes pass ~7 km apart near the highest latitude.
const obj = { l1: fix('1 99999U 98067A   26298.50000000  .00016717  00000-0  30000-3 0  9990'), l2: fix('2 99999  51.6400 120.1000 0004000  90.0000 270.0000 15.50000000400000') };
const epoch = Date.UTC(2026, 0, 1) + (298.5 - 1) * 86400000;

describe('validation', () => {
  test('closest approach is found and matches geometry', () => {
    const ca = V.closestApproach(twin, obj, epoch + 3 * 3600000);
    expect(ca).not.toBeNull();
    // 2 a sin(dRAAN/2) cos(i) ~ 7.3 km for a ~6790 km orbit
    expect(ca.missKm).toBeGreaterThan(6);
    expect(ca.missKm).toBeLessThan(8.5);
  });

  test('a CDM that agrees with ASTRA gives near-zero differences', () => {
    const ca = V.closestApproach(twin, obj, epoch + 3 * 3600000);
    const r = V.compare(twin, obj, { tcaMs: ca.tcaMs, missKm: ca.missKm, pc: 1e-9 });
    expect(r.status).toBe('compared');
    expect(Math.abs(r.dTcaSec)).toBeLessThan(0.5);
    expect(Math.abs(r.dMissKm)).toBeLessThan(0.01);
    expect(r.flagged).toBe(true);
  });

  test('the same TCA is found when the CDM TCA is a few minutes off', () => {
    const ca = V.closestApproach(twin, obj, epoch + 3 * 3600000);
    const r = V.compare(twin, obj, { tcaMs: ca.tcaMs + 4 * 60000, missKm: ca.missKm + 1.5, pc: null });
    expect(Math.abs(r.dTcaSec + 240)).toBeLessThan(1);
    expect(r.dMissKm).toBeCloseTo(-1.5, 2);
    expect(r.pcLog10Ratio).toBeNull();
    expect(r.severityAgrees).toBeNull();
  });

  test('summary statistics', () => {
    const rows = [
      { spacecraftId: 'a', status: 'compared', dTcaSec: 2, dMissKm: 0.5, pcLog10Ratio: 0.3, severityAgrees: true, flagged: true, cdmSeverity: 'warning', astraSeverity: 'warning' },
      { spacecraftId: 'a', status: 'compared', dTcaSec: -4, dMissKm: -1.5, pcLog10Ratio: 2, severityAgrees: false, flagged: true, cdmSeverity: 'critical', astraSeverity: 'nominal' },
      { spacecraftId: 'b', status: 'compared', dTcaSec: 10, dMissKm: 3, pcLog10Ratio: null, severityAgrees: null, flagged: false, cdmSeverity: null, astraSeverity: 'nominal' },
      { spacecraftId: 'b', status: 'object_not_found' },
    ];
    const s = V.summarise(rows);
    expect(s.cdms).toBe(4);
    expect(s.compared).toBe(3);
    expect(s.satellites).toBe(2);
    expect(s.medianAbsDTcaSec).toBe(4);
    expect(s.medianAbsDMissKm).toBe(1.5);
    expect(s.flaggedRate).toBeCloseTo(2 / 3);
    expect(s.pcWithin1OrderRate).toBe(0.5);
    expect(s.severityAgreementRate).toBe(0.5);
    expect(s.highRiskCdms).toBe(2);
    expect(s.highRiskCaughtRate).toBe(0.5);
  });

  test('CSV export escapes text and guards against formulas', () => {
    const out = V.csv([{ spacecraft: 'Sat, "one"', objectName: '=HYPERLINK("x")', dTcaSec: -1.23456789, status: 'compared' }]);
    const line = out.split('\n')[1];
    expect(line).toContain('"Sat, ""one"""');
    expect(line).toContain("'=HYPERLINK");
    expect(line).toContain('-1.23457');
  });
});
