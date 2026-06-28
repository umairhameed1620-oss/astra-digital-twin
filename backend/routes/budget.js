const express = require('express');
const pool = require('../utils/db');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Get full budget analysis for spacecraft
router.get('/:spacecraftId', authenticateToken, async (req, res) => {
  try {
    const components = await pool.query(
      'SELECT * FROM components WHERE spacecraft_id = $1',
      [req.params.spacecraftId]
    );

    const spacecraft = await pool.query(
      'SELECT * FROM spacecraft WHERE id = $1 AND user_id = $2',
      [req.params.spacecraftId, req.user.userId]
    );

    if (spacecraft.rows.length === 0) return res.status(404).json({ error: 'Spacecraft not found' });

    const sc = spacecraft.rows[0];
    const comps = components.rows;

    // Mass Budget
    const massByCategory = {};
    let totalMass = 0;
    comps.forEach(c => {
      const mass = parseFloat(c.mass_kg || 0);
      massByCategory[c.category] = (massByCategory[c.category] || 0) + mass;
      totalMass += mass;
    });

    // Power Budget
    const powerByCategory = {};
    let totalConsumption = 0;
    let totalGeneration = 0;
    comps.forEach(c => {
      const consumption = parseFloat(c.power_consumption_w || 0);
      const generation = parseFloat(c.power_generation_w || 0);
      powerByCategory[c.category] = powerByCategory[c.category] || { consumption: 0, generation: 0 };
      powerByCategory[c.category].consumption += consumption;
      powerByCategory[c.category].generation += generation;
      totalConsumption += consumption;
      totalGeneration += generation;
    });

    const powerMargin = totalGeneration - totalConsumption;
    const powerMarginPct = totalGeneration > 0 ? (powerMargin / totalGeneration) * 100 : 0;

    // Delta-V Budget (Tsiolkovsky Rocket Equation)
    const propellantComps = comps.filter(c => c.type === 'propellant_tank');
    const thrusterComps = comps.filter(c => ['thruster', 'hall_thruster', 'cold_gas', 'main_engine'].includes(c.type));

    let deltaVBudget = null;
    if (propellantComps.length > 0 && thrusterComps.length > 0) {
      const avgIsp = thrusterComps.reduce((sum, t) => sum + (t.specifications?.isp_s || 220), 0) / thrusterComps.length;
      const g0 = 9.80665; // m/s²
      const dryMass = totalMass;
      // Estimate propellant mass from tank volumes (assuming hydrazine density ~1000 kg/m³)
      const propellantMass = propellantComps.reduce((sum, t) => {
        const vol = t.specifications?.volume_l || 0;
        return sum + (vol * 0.9); // kg (density ~0.9 kg/L for hydrazine)
      }, 0);
      const wetMass = dryMass + propellantMass;
      const deltaV = avgIsp * g0 * Math.log(wetMass / dryMass);
      deltaVBudget = {
        dryMassKg: dryMass.toFixed(2),
        propellantMassKg: propellantMass.toFixed(2),
        wetMassKg: wetMass.toFixed(2),
        avgIspS: avgIsp.toFixed(1),
        deltaVMs: deltaV.toFixed(1),
        deltaVKms: (deltaV / 1000).toFixed(3)
      };
    }

    // Health assessment
    const warnings = [];
    if (powerMarginPct < 10) warnings.push({ type: 'power', severity: 'critical', message: `Power margin critically low: ${powerMarginPct.toFixed(1)}%` });
    else if (powerMarginPct < 20) warnings.push({ type: 'power', severity: 'warning', message: `Power margin low: ${powerMarginPct.toFixed(1)}%` });

    const hasAttitudeControl = comps.some(c => c.category === 'attitude_control');
    if (!hasAttitudeControl) warnings.push({ type: 'subsystem', severity: 'warning', message: 'No attitude control subsystem defined' });

    const hasComms = comps.some(c => c.category === 'comms');
    if (!hasComms) warnings.push({ type: 'subsystem', severity: 'warning', message: 'No communications subsystem defined' });

    const hasThermal = comps.some(c => c.category === 'thermal');
    if (!hasThermal) warnings.push({ type: 'subsystem', severity: 'info', message: 'No thermal control subsystem defined' });

    res.json({
      spacecraftId: req.params.spacecraftId,
      spacecraftName: sc.name,
      spacecraftType: sc.type,
      massBudget: {
        totalMassKg: totalMass.toFixed(3),
        byCategory: massByCategory,
        componentCount: comps.length
      },
      powerBudget: {
        totalGenerationW: totalGeneration.toFixed(2),
        totalConsumptionW: totalConsumption.toFixed(2),
        marginW: powerMargin.toFixed(2),
        marginPct: powerMarginPct.toFixed(1),
        status: powerMarginPct >= 20 ? 'healthy' : powerMarginPct >= 10 ? 'warning' : 'critical',
        byCategory: powerByCategory
      },
      deltaVBudget,
      warnings,
      overallHealth: warnings.some(w => w.severity === 'critical') ? 'critical' :
                     warnings.some(w => w.severity === 'warning') ? 'warning' : 'nominal'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate budget' });
  }
});

module.exports = router;
