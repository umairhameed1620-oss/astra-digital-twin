const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../utils/database');
const { cache } = require('../utils/redis');
const { NotFoundError } = require('../middleware/errorHandler');
const logger = require('../monitoring/logger');
const router = express.Router();

router.use(authenticate);

// Conjunction probability calculator (Alfano/Foster method)
const calcCollisionProbability = (missDistance, relativeVelocity, combinedRadius = 0.01) => {
  const sigma = missDistance / 3;
  const Pc = Math.exp(-0.5 * Math.pow(missDistance / sigma, 2)) * (combinedRadius / (sigma * Math.sqrt(2 * Math.PI)));
  return Math.max(0, Math.min(1, Pc));
};

// Hohmann transfer delta-V calculator
const hohmannDeltaV = (r1, r2, mu = 3.986e14) => {
  const r1m = r1 * 1000;
  const r2m = r2 * 1000;
  const v1 = Math.sqrt(mu / r1m);
  const vt1 = Math.sqrt(2 * mu * r2m / (r1m * (r1m + r2m)));
  const vt2 = Math.sqrt(2 * mu * r1m / (r2m * (r1m + r2m)));
  const v2 = Math.sqrt(mu / r2m);
  const dv1 = Math.abs(vt1 - v1);
  const dv2 = Math.abs(v2 - vt2);
  const transferTime = Math.PI * Math.sqrt(Math.pow((r1m + r2m) / 2, 3) / mu);
  return { dv1: dv1.toFixed(2), dv2: dv2.toFixed(2), total: (dv1 + dv2).toFixed(2), transferTimeMin: (transferTime / 60).toFixed(1) };
};

// Generate conjunction events for a spacecraft
const generateConjunctionEvents = (spacecraft) => {
  const events = [];
  const debrisObjects = [
    { id: 'COSMOS-2251-DEB-001', name: 'COSMOS 2251 Debris', altitude: 545, inclination: 74 },
    { id: 'FENGYUN-1C-DEB-042', name: 'FENGYUN 1C Debris', altitude: 558, inclination: 98 },
    { id: 'IRIDIUM-33-DEB-007', name: 'IRIDIUM 33 Debris', altitude: 563, inclination: 86 },
    { id: 'SL-16-RB-002', name: 'SL-16 Rocket Body', altitude: 552, inclination: 71 },
    { id: 'BREEZE-M-DEB-003', name: 'Breeze-M Debris', altitude: 547, inclination: 65 },
  ];

  const scAlt = spacecraft.config?.altitude || 550;
  const scInc = spacecraft.config?.inclination || 53;

  debrisObjects.forEach(debris => {
    const altDiff = Math.abs(scAlt - debris.altitude);
    const incDiff = Math.abs(scInc - debris.inclination);
    if (altDiff < 20) {
      const missDistance = 0.1 + Math.random() * 5;
      const relVelocity = 5 + Math.random() * 10;
      const Pc = calcCollisionProbability(missDistance, relVelocity);
      const hoursToTCA = 12 + Math.random() * 72;
      const severity = Pc > 0.001 ? 'critical' : Pc > 0.0001 ? 'warning' : 'nominal';
      events.push({
        id: `conj_${spacecraft.id}_${debris.id}`,
        spacecraftId: spacecraft.id,
        spacecraftName: spacecraft.name,
        objectId: debris.id,
        objectName: debris.name,
        tcaTime: new Date(Date.now() + hoursToTCA * 3600000).toISOString(),
        hoursToTCA: hoursToTCA.toFixed(1),
        missDistance: missDistance.toFixed(3),
        relativeVelocity: relVelocity.toFixed(2),
        collisionProbability: Pc.toExponential(2),
        severity,
        debrisAltitude: debris.altitude,
        debrisInclination: debris.inclination,
        recommendation: severity === 'critical'
          ? 'IMMEDIATE manoeuvre required. Execute avoidance burn T-24h before TCA.'
          : severity === 'warning'
          ? 'Monitor closely. Prepare contingency manoeuvre. Update tracking every 6h.'
          : 'Nominal conjunction. No action required. Continue monitoring.',
      });
    }
  });

  return events.sort((a, b) => parseFloat(a.hoursToTCA) - parseFloat(b.hoursToTCA));
};

// GET /api/conjunction/:spacecraftId - Get conjunction events
router.get('/:spacecraftId', async (req, res) => {
  const sc = await query('SELECT * FROM spacecraft WHERE id=$1 AND user_id=$2 AND is_deleted=false', [req.params.spacecraftId, req.user.id]);
  if (sc.rows.length === 0) throw new NotFoundError('Spacecraft');

  const cacheKey = `conjunction:${req.params.spacecraftId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return res.set('X-Cache', 'HIT').json(cached);

  const spacecraft = sc.rows[0];
  const events = generateConjunctionEvents(spacecraft);

  const result = {
    spacecraftId: spacecraft.id,
    spacecraftName: spacecraft.name,
    generatedAt: new Date().toISOString(),
    totalEvents: events.length,
    criticalCount: events.filter(e => e.severity === 'critical').length,
    warningCount: events.filter(e => e.severity === 'warning').length,
    events,
  };

  await cache.set(cacheKey, result, 300);
  logger.info('Conjunction analysis generated', { spacecraftId: req.params.spacecraftId, events: events.length });
  res.json(result);
});

// GET /api/conjunction/:spacecraftId/manoeuvre - Get manoeuvre recommendations
router.get('/:spacecraftId/manoeuvre', async (req, res) => {
  const sc = await query('SELECT * FROM spacecraft WHERE id=$1 AND user_id=$2', [req.params.spacecraftId, req.user.id]);
  if (sc.rows.length === 0) throw new NotFoundError('Spacecraft');

  const spacecraft = sc.rows[0];
  const cfg = spacecraft.config || {};
  const currentAlt = cfg.altitude || 550;
  const avoidanceAlt = currentAlt + 2;
  const earthRadius = 6371;

  const manoeuvre = hohmannDeltaV(earthRadius + currentAlt, earthRadius + avoidanceAlt);

  res.json({
    spacecraftId: spacecraft.id,
    currentAltitude: currentAlt,
    recommendedAltitude: avoidanceAlt,
    manoeuvre: {
      type: 'Hohmann Transfer (Avoidance)',
      dv1: `${manoeuvre.dv1} m/s`,
      dv2: `${manoeuvre.dv2} m/s`,
      totalDeltaV: `${manoeuvre.total} m/s`,
      transferTime: `${manoeuvre.transferTimeMin} minutes`,
      fuelEstimate: `${(parseFloat(manoeuvre.total) * 0.1).toFixed(2)} kg`,
      executionWindow: 'T-24h before TCA',
      burnDuration: `${(parseFloat(manoeuvre.total) / 30).toFixed(1)} seconds`,
    },
    deltaVBudgetRemaining: cfg.deltaV || 500,
    budgetAfterManoeuvre: ((cfg.deltaV || 500) - parseFloat(manoeuvre.total)).toFixed(1),
    warning: parseFloat(manoeuvre.total) > (cfg.deltaV || 500) * 0.5
      ? 'WARNING: This manoeuvre uses more than 50% of remaining ΔV budget'
      : null,
  });
});

module.exports = router;
