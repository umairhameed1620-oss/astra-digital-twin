const express = require('express');
const pool = require('../utils/db');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Component library - predefined templates
const COMPONENT_LIBRARY = {
  power: [
    { name: 'Triple-Junction Solar Panel (1m²)', type: 'solar_panel', mass_kg: 2.5, power_generation_w: 300, power_consumption_w: 0, specifications: { efficiency: 0.32, area_m2: 1, voltage: 28 } },
    { name: 'Li-Ion Battery Pack (100Wh)', type: 'battery', mass_kg: 1.2, power_generation_w: 0, power_consumption_w: 0, specifications: { capacity_wh: 100, voltage: 28.8, cycles: 5000 } },
    { name: 'Power Control Unit', type: 'pcu', mass_kg: 0.8, power_generation_w: 0, power_consumption_w: 15, specifications: { efficiency: 0.95 } },
    { name: 'RTG Power Source (100W)', type: 'rtg', mass_kg: 45, power_generation_w: 100, power_consumption_w: 0, specifications: { fuel: 'Pu-238', lifetime_years: 14 } }
  ],
  propulsion: [
    { name: 'Monopropellant Thruster (1N)', type: 'thruster', mass_kg: 0.35, power_consumption_w: 10, specifications: { thrust_n: 1, isp_s: 220, propellant: 'Hydrazine' } },
    { name: 'Hall Effect Thruster (200mN)', type: 'hall_thruster', mass_kg: 3.2, power_consumption_w: 1500, specifications: { thrust_mn: 200, isp_s: 1600, propellant: 'Xenon' } },
    { name: 'Cold Gas Thruster (0.1N)', type: 'cold_gas', mass_kg: 0.15, power_consumption_w: 2, specifications: { thrust_n: 0.1, isp_s: 70, propellant: 'Nitrogen' } },
    { name: 'Propellant Tank (10L)', type: 'propellant_tank', mass_kg: 1.5, power_consumption_w: 0, specifications: { volume_l: 10, max_pressure_bar: 24 } },
    { name: 'Merlin Engine (845kN)', type: 'main_engine', mass_kg: 470, power_consumption_w: 500, specifications: { thrust_kn: 845, isp_s: 282, propellant: 'RP-1/LOX' } }
  ],
  thermal: [
    { name: 'Multi-Layer Insulation (MLI)', type: 'mli', mass_kg: 0.5, power_consumption_w: 0, specifications: { layers: 20, emissivity: 0.02 } },
    { name: 'Passive Radiator Panel (0.25m²)', type: 'radiator', mass_kg: 0.8, power_consumption_w: 0, specifications: { area_m2: 0.25, emissivity: 0.85 } },
    { name: 'Heater (5W)', type: 'heater', mass_kg: 0.05, power_consumption_w: 5, specifications: { power_w: 5, range_c: '-40 to +85' } },
    { name: 'Heat Pipe', type: 'heat_pipe', mass_kg: 0.3, power_consumption_w: 0, specifications: { conductance_w_k: 50, fluid: 'Ammonia' } }
  ],
  comms: [
    { name: 'S-Band Transceiver', type: 'transceiver', mass_kg: 0.9, power_consumption_w: 8, specifications: { frequency_ghz: 2.4, data_rate_kbps: 2048, range_km: 2000 } },
    { name: 'X-Band High Gain Antenna', type: 'antenna', mass_kg: 2.1, power_consumption_w: 0, specifications: { gain_dbi: 35, frequency_ghz: 8.4, diameter_m: 0.6 } },
    { name: 'Ka-Band Transceiver', type: 'transceiver', mass_kg: 1.8, power_consumption_w: 25, specifications: { frequency_ghz: 26.5, data_rate_mbps: 100 } },
    { name: 'UHF Antenna (Omnidirectional)', type: 'antenna', mass_kg: 0.3, power_consumption_w: 0, specifications: { frequency_mhz: 437, gain_dbi: 2 } }
  ],
  attitude_control: [
    { name: 'Reaction Wheel (0.1 Nms)', type: 'reaction_wheel', mass_kg: 0.9, power_consumption_w: 4, specifications: { momentum_nms: 0.1, max_torque_nm: 0.01, speed_rpm: 6000 } },
    { name: 'Star Tracker', type: 'star_tracker', mass_kg: 0.85, power_consumption_w: 4, specifications: { accuracy_arcsec: 1, update_rate_hz: 4 } },
    { name: 'Magnetorquer (1 Am²)', type: 'magnetorquer', mass_kg: 0.3, power_consumption_w: 2, specifications: { dipole_moment_am2: 1 } },
    { name: 'IMU / Gyroscope', type: 'imu', mass_kg: 0.35, power_consumption_w: 3, specifications: { bias_stability_dph: 0.01 } },
    { name: 'Sun Sensor', type: 'sun_sensor', mass_kg: 0.05, power_consumption_w: 0.1, specifications: { accuracy_deg: 0.5, fov_deg: 120 } }
  ],
  structure: [
    { name: 'Primary Structure Frame (Al 6061)', type: 'frame', mass_kg: 5.0, power_consumption_w: 0, specifications: { material: 'Aluminium 6061-T6', yield_strength_mpa: 276 } },
    { name: 'Separation System', type: 'separation', mass_kg: 1.2, power_consumption_w: 0, specifications: { type: 'Spring-loaded clamp band' } },
    { name: 'Deployable Boom (2m)', type: 'boom', mass_kg: 0.8, power_consumption_w: 5, specifications: { length_m: 2, material: 'CFRP' } }
  ],
  payload: [
    { name: 'Earth Observation Camera (5m GSD)', type: 'camera', mass_kg: 3.5, power_consumption_w: 25, specifications: { resolution_m: 5, fov_deg: 2.5, sensor: 'CMOS' } },
    { name: 'SAR Antenna', type: 'sar', mass_kg: 12, power_consumption_w: 800, specifications: { frequency_ghz: 9.6, resolution_m: 3 } },
    { name: 'Scientific Spectrometer', type: 'spectrometer', mass_kg: 1.8, power_consumption_w: 12, specifications: { wavelength_range_nm: '400-2500', resolution_nm: 5 } }
  ],
  navigation: [
    { name: 'GPS Receiver', type: 'gps', mass_kg: 0.25, power_consumption_w: 2, specifications: { accuracy_m: 2.5, channels: 12 } },
    { name: 'GNSS Receiver (Multi-constellation)', type: 'gnss', mass_kg: 0.4, power_consumption_w: 3.5, specifications: { accuracy_m: 1, constellations: ['GPS', 'GLONASS', 'Galileo'] } }
  ]
};

// Get component library
router.get('/library', authenticateToken, (req, res) => {
  const { category } = req.query;
  if (category && COMPONENT_LIBRARY[category]) {
    return res.json({ category, components: COMPONENT_LIBRARY[category] });
  }
  res.json({ library: COMPONENT_LIBRARY, categories: Object.keys(COMPONENT_LIBRARY) });
});

// Get all components for a spacecraft
router.get('/spacecraft/:spacecraftId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM components WHERE spacecraft_id = $1 ORDER BY category, name',
      [req.params.spacecraftId]
    );
    res.json({ components: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch components' });
  }
});

// Add component to spacecraft
router.post('/spacecraft/:spacecraftId', authenticateToken, async (req, res) => {
  try {
    const { name, type, category, specifications, mass_kg, power_consumption_w, power_generation_w, position_x, position_y } = req.body;

    if (!name || !type || !category) {
      return res.status(400).json({ error: 'Name, type and category are required' });
    }

    // Verify spacecraft belongs to user
    const sc = await pool.query(
      'SELECT id FROM spacecraft WHERE id = $1 AND user_id = $2',
      [req.params.spacecraftId, req.user.userId]
    );
    if (sc.rows.length === 0) return res.status(404).json({ error: 'Spacecraft not found' });

    const result = await pool.query(
      `INSERT INTO components (spacecraft_id, name, type, category, specifications, mass_kg, power_consumption_w, power_generation_w, position_x, position_y)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.params.spacecraftId, name, type, category,
       JSON.stringify(specifications || {}),
       mass_kg || 0, power_consumption_w || 0, power_generation_w || 0,
       position_x || 0, position_y || 0]
    );

    // Emit real-time update
    req.io?.to(req.params.spacecraftId).emit('component_added', result.rows[0]);

    res.status(201).json({ component: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add component' });
  }
});

// Update component
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { name, specifications, mass_kg, power_consumption_w, power_generation_w, position_x, position_y, status } = req.body;

    const result = await pool.query(
      `UPDATE components SET
        name = COALESCE($1, name),
        specifications = COALESCE($2, specifications),
        mass_kg = COALESCE($3, mass_kg),
        power_consumption_w = COALESCE($4, power_consumption_w),
        power_generation_w = COALESCE($5, power_generation_w),
        position_x = COALESCE($6, position_x),
        position_y = COALESCE($7, position_y),
        status = COALESCE($8, status)
       WHERE id = $9 RETURNING *`,
      [name, specifications ? JSON.stringify(specifications) : null,
       mass_kg, power_consumption_w, power_generation_w,
       position_x, position_y, status, req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Component not found' });
    res.json({ component: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update component' });
  }
});

// Delete component
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM components WHERE id = $1 RETURNING id, name',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Component not found' });
    res.json({ message: `Component "${result.rows[0].name}" removed` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete component' });
  }
});

module.exports = router;
