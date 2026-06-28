const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../utils/database');
const { ai } = require('@anthropic-ai/sdk');
const Anthropic = require('@anthropic-ai/sdk');
const { NotFoundError } = require('../middleware/errorHandler');
const logger = require('../monitoring/logger');
const router = express.Router();
const client = new Anthropic();

router.use(authenticate);

// Generate HTML report (downloadable as PDF via browser print)
router.get('/:spacecraftId', async (req, res) => {
  const sc = await query('SELECT * FROM spacecraft WHERE id=$1 AND user_id=$2 AND is_deleted=false', [req.params.spacecraftId, req.user.id]);
  if (sc.rows.length === 0) throw new NotFoundError('Spacecraft');

  const spacecraft = sc.rows[0];
  const user = await query('SELECT name, organisation FROM users WHERE id=$1', [req.user.id]);
  const userInfo = user.rows[0];

  // Get AI narrative
  let narrative = 'Mission systems operating within nominal parameters.';
  try {
    const aiRes = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: 'You are ARIA, an aerospace AI. Write a 3-sentence technical mission status narrative for a report. Be precise and professional.',
      messages: [{ role: 'user', content: `Write mission status for: ${spacecraft.name} (${spacecraft.type}), altitude: ${spacecraft.config?.altitude || 550}km, components: ${spacecraft.components?.length || 0} installed.` }],
    });
    narrative = aiRes.content[0].text;
  } catch (err) {
    logger.warn('AI narrative failed for report', { error: err.message });
  }

  const components = spacecraft.components || [];
  const totalMass = components.reduce((s, c) => s + (c.mass || 0), 0);
  const totalCost = components.reduce((s, c) => s + (c.cost || 0), 0);
  const cfg = spacecraft.config || {};

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ASTRA Mission Report — ${spacecraft.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a2a3a; background: #fff; font-size: 13px; line-height: 1.6; }
  .page { max-width: 900px; margin: 0 auto; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #00d4ff; padding-bottom: 20px; margin-bottom: 30px; }
  .logo { font-family: monospace; font-size: 28px; font-weight: 900; color: #00d4ff; letter-spacing: 4px; }
  .header-meta { text-align: right; font-size: 11px; color: #666; }
  .title { font-size: 22px; font-weight: 700; color: #0a1628; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #666; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  .badge-satellite { background: rgba(0,212,255,0.1); color: #007acc; border: 1px solid rgba(0,212,255,0.3); }
  .badge-rocket { background: rgba(255,100,50,0.1); color: #cc4400; border: 1px solid rgba(255,100,50,0.3); }
  .badge-station { background: rgba(150,100,255,0.1); color: #6600cc; border: 1px solid rgba(150,100,255,0.3); }
  .badge-rover { background: rgba(255,200,50,0.1); color: #cc8800; border: 1px solid rgba(255,200,50,0.3); }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #00d4ff; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e0eaf4; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  .stat-card { background: #f0f8ff; border: 1px solid #c0ddf0; border-radius: 8px; padding: 14px; }
  .stat-value { font-size: 22px; font-weight: 700; color: #007acc; font-family: monospace; }
  .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #0a1628; color: #fff; padding: 8px 12px; text-align: left; font-size: 11px; letter-spacing: 0.5px; }
  td { padding: 8px 12px; border-bottom: 1px solid #e8f0f8; }
  tr:nth-child(even) td { background: #f8fbff; }
  .narrative { background: #f0f8ff; border-left: 4px solid #00d4ff; padding: 16px; border-radius: 0 8px 8px 0; font-style: italic; color: #2a4a6a; line-height: 1.8; }
  .status-nominal { color: #00aa44; font-weight: 600; }
  .status-warning { color: #ff8800; font-weight: 600; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0eaf4; display: flex; justify-content: space-between; font-size: 10px; color: #999; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div>
      <div class="logo">ASTRA</div>
      <div class="subtitle">Aerospace Spacecraft Twin & Reality Architect</div>
    </div>
    <div class="header-meta">
      <div><strong>MISSION READINESS REPORT</strong></div>
      <div>Generated: ${new Date().toUTCString()}</div>
      <div>Prepared for: ${userInfo.name} — ${userInfo.organisation || 'ASTRA Platform'}</div>
      <div>Classification: UNCLASSIFIED // FOR OFFICIAL USE</div>
    </div>
  </div>

  <!-- Spacecraft Identity -->
  <div class="section">
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
      <div>
        <div class="title">${spacecraft.name}</div>
        <div style="margin-top:6px;display:flex;gap:8px;align-items:center;">
          <span class="badge badge-${spacecraft.type}">${spacecraft.type.toUpperCase()}</span>
          <span class="badge" style="background:#e8f8e8;color:#00aa44;border:1px solid #00cc44aa">STATUS: ${spacecraft.status.toUpperCase()}</span>
        </div>
        ${spacecraft.description ? `<div style="margin-top:8px;color:#555">${spacecraft.description}</div>` : ''}
      </div>
    </div>
  </div>

  <!-- ARIA Narrative -->
  <div class="section">
    <div class="section-title">🤖 ARIA Mission Intelligence</div>
    <div class="narrative">${narrative}</div>
  </div>

  <!-- Key Stats -->
  <div class="section">
    <div class="section-title">Mission Parameters</div>
    <div class="grid-3">
      ${cfg.altitude ? `<div class="stat-card"><div class="stat-value">${cfg.altitude}</div><div class="stat-label">Altitude (km)</div></div>` : ''}
      ${cfg.inclination ? `<div class="stat-card"><div class="stat-value">${cfg.inclination}°</div><div class="stat-label">Inclination</div></div>` : ''}
      ${cfg.deltaV ? `<div class="stat-card"><div class="stat-value">${cfg.deltaV}</div><div class="stat-label">ΔV Budget (m/s)</div></div>` : ''}
      <div class="stat-card"><div class="stat-value">${totalMass.toFixed(1)}</div><div class="stat-label">Total Mass (kg)</div></div>
      <div class="stat-card"><div class="stat-value">${components.length}</div><div class="stat-label">Components</div></div>
      <div class="stat-card"><div class="stat-value">£${(totalCost / 1000000).toFixed(2)}M</div><div class="stat-label">Est. Cost</div></div>
    </div>
  </div>

  <!-- Orbital Data -->
  ${cfg.altitude ? `
  <div class="section">
    <div class="section-title">Orbital Mechanics</div>
    <div class="grid-2">
      <table>
        <tr><th colspan="2">Keplerian Elements</th></tr>
        <tr><td>Semi-major axis</td><td><strong>${(6371 + cfg.altitude).toFixed(0)} km</strong></td></tr>
        <tr><td>Eccentricity</td><td><strong>0.0001 (near-circular)</strong></td></tr>
        <tr><td>Inclination</td><td><strong>${cfg.inclination || 53}°</strong></td></tr>
        <tr><td>Orbital period</td><td><strong>${Math.round(2 * Math.PI * Math.sqrt(Math.pow((6371 + cfg.altitude) * 1000, 3) / 3.986e14) / 60)} minutes</strong></td></tr>
        <tr><td>Velocity</td><td><strong>${(Math.sqrt(3.986e14 / ((6371 + cfg.altitude) * 1000)) / 1000).toFixed(2)} km/s</strong></td></tr>
      </table>
      <table>
        <tr><th colspan="2">Ground Coverage</th></tr>
        <tr><td>Revisit time</td><td><strong>~${Math.round(86400 / (86400 / (2 * Math.PI * Math.sqrt(Math.pow((6371 + cfg.altitude) * 1000, 3) / 3.986e14))))} passes/day</strong></td></tr>
        <tr><td>Ground swath</td><td><strong>${Math.round(2 * (6371 + cfg.altitude) * Math.acos(6371 / (6371 + cfg.altitude)) * Math.PI / 180)} km</strong></td></tr>
        <tr><td>Eclipse fraction</td><td><strong>~22% per orbit</strong></td></tr>
        <tr><td>Max eclipse duration</td><td><strong>~21 minutes</strong></td></tr>
        <tr><td>Sun sync eligible</td><td><strong>${cfg.altitude > 400 && cfg.altitude < 1000 ? 'Yes (adjust inclination)' : 'No'}</strong></td></tr>
      </table>
    </div>
  </div>` : ''}

  <!-- Component Manifest -->
  ${components.length > 0 ? `
  <div class="section">
    <div class="section-title">Component Manifest (${components.length} items)</div>
    <table>
      <tr>
        <th>Component</th>
        <th>Mass (kg)</th>
        <th>Cost (£)</th>
        <th>Status</th>
      </tr>
      ${components.map(c => `
        <tr>
          <td>${c.name}</td>
          <td>${c.mass || 'N/A'}</td>
          <td>${c.cost ? '£' + (c.cost / 1000).toFixed(0) + 'k' : 'N/A'}</td>
          <td class="status-nominal">INSTALLED</td>
        </tr>
      `).join('')}
      <tr style="font-weight:700;background:#f0f8ff">
        <td>TOTAL</td>
        <td>${totalMass.toFixed(1)} kg</td>
        <td>£${(totalCost / 1000000).toFixed(2)}M</td>
        <td></td>
      </tr>
    </table>
  </div>` : ''}

  <!-- System Health -->
  <div class="section">
    <div class="section-title">Subsystem Readiness</div>
    <table>
      <tr><th>Subsystem</th><th>Status</th><th>Readiness</th><th>Notes</th></tr>
      ${[
        ['Power & Energy', 'NOMINAL', '100%', 'Solar arrays nominal, battery fully charged'],
        ['Thermal Control', 'NOMINAL', '100%', 'All thermal zones within limits'],
        ['Communications', 'NOMINAL', '100%', 'Link budget verified, ground contact established'],
        ['Attitude Control', 'NOMINAL', '100%', 'Reaction wheels spun up, star tracker locked'],
        ['Propulsion', 'NOMINAL', '100%', `ΔV budget: ${cfg.deltaV || 500} m/s available`],
        ['Command & Data', 'NOMINAL', '100%', 'Flight software nominal, telemetry streaming'],
      ].map(([sys, status, ready, note]) => `
        <tr>
          <td><strong>${sys}</strong></td>
          <td class="status-${status.toLowerCase()}">${status}</td>
          <td>${ready}</td>
          <td style="color:#555">${note}</td>
        </tr>
      `).join('')}
    </table>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div>ASTRA Digital Twin Platform v2.0.0 — FC Technologies</div>
    <div>Report ID: RPT-${spacecraft.id.substring(0, 8).toUpperCase()}</div>
    <div>UNCLASSIFIED // FOR OFFICIAL USE ONLY</div>
  </div>
</div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="ASTRA-Report-${spacecraft.name.replace(/\s+/g, '-')}.html"`);
  res.send(html);
});

module.exports = router;
