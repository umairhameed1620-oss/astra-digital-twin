const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { authenticate } = require('../middleware/auth');
const { query } = require('../utils/database');
const router = express.Router();
const client = new Anthropic();

router.use(authenticate);

router.post('/analyse', async (req, res) => {
  try {
    const { spacecraftId, telemetry, question } = req.body;
    const sc = await query('SELECT * FROM spacecraft WHERE id=$1', [spacecraftId]);
    const spacecraft = sc.rows[0];

    const systemPrompt = `You are ARIA (Autonomous Reasoning & Intelligence for Aerospace), the AI co-pilot for the ASTRA Digital Twin Platform. You are an expert aerospace engineer with deep knowledge of spacecraft systems, orbital mechanics, propulsion, thermal control, power systems, and mission planning.

You are analysing the digital twin of: ${spacecraft?.name || 'Unknown Spacecraft'} (${spacecraft?.type || 'Unknown Type'})

Current telemetry data:
${JSON.stringify(telemetry, null, 2)}

Provide concise, technical, actionable analysis. Use aerospace terminology. Flag anomalies clearly with severity levels. Be direct and precise like a real mission controller.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: question || 'Analyse the current spacecraft status and provide a mission health report.' }]
    });

    res.json({ response: response.content[0].text, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI analysis failed' });
  }
});

router.post('/briefing', async (req, res) => {
  try {
    const { spacecraftId, telemetry } = req.body;
    const sc = await query('SELECT * FROM spacecraft WHERE id=$1', [spacecraftId]);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: 'You are ARIA, an aerospace AI co-pilot. Generate daily mission briefings in a structured format with: MISSION STATUS, SYSTEM HEALTH (each subsystem), ANOMALIES, RECOMMENDATIONS, and NEXT 24H OUTLOOK. Be concise and technical.',
      messages: [{ role: 'user', content: `Generate daily briefing for ${sc.rows[0]?.name}. Telemetry: ${JSON.stringify(telemetry)}` }]
    });

    res.json({ briefing: response.content[0].text, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Briefing generation failed' });
  }
});

module.exports = router;
