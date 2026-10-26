// Smaller endpoints: TLE lookup, simulation flags, telemetry/AI placeholders, legacy HTML report.
const express = require('express');
const { auth, canWrite } = require('../lib/auth');
const { handle, HttpError } = require('../lib/http');
const O = require('../lib/orbit');
const T = require('../lib/tle');
const conj = require('../utils/conjunction');
const { getOwned } = require('./spacecraft');

const router = express.Router();

// Preview the current element set for a NORAD ID before linking a twin to it.
router.get('/tle/:norad', auth, handle(async (req, res) => {
  let tle;
  try { tle = await T.byNorad(req.params.norad, conj.findInCatalog); } catch (e) { throw new HttpError(404, e.message); }
  const el = O.describe({ kind: 'tle', l1: tle.l1, l2: tle.l2 });
  res.json({
    noradId: tle.norad, name: tle.name, line1: tle.l1, line2: tle.l2, epoch: tle.epoch,
    ageDays: Number(((Date.now() - tle.epoch.getTime()) / 86400000).toFixed(2)),
    perigeeKm: Number(el.perigeeKm.toFixed(1)), apogeeKm: Number(el.apogeeKm.toFixed(1)),
    inclinationDeg: Number(el.inclinationDeg.toFixed(3)), periodMin: Number(el.periodMin.toFixed(2)),
  });
}));

// Simulation start/stop only confirm ownership; they no longer overwrite the lifecycle status.
router.post('/simulation/start/:id', auth, canWrite, handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.id);
  res.json({ message: 'Simulation started', spacecraftId: sc.id, config: sc.config || {} });
}));
router.post('/simulation/stop/:id', auth, canWrite, handle(async (req, res) => {
  await getOwned(req.params.id, req.user.id);
  res.json({ message: 'Simulation stopped' });
}));

router.get('/telemetry/:id/history', auth, (req, res) => res.json([]));
router.post('/telemetry/:id/log', auth, (req, res) => res.json({ message: 'Logged' }));
router.post('/ai/analyse', auth, (req, res) => res.json({ response: 'ARIA AI is offline. Add ANTHROPIC_API_KEY to enable it.', timestamp: new Date().toISOString() }));
router.post('/ai/briefing', auth, (req, res) => res.json({ briefing: 'ARIA is offline.', timestamp: new Date().toISOString() }));

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
router.get('/reports/:id', auth, handle(async (req, res) => {
  const s = await getOwned(req.params.id, req.user.id);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.send(`<html><body style="font-family:monospace;background:#020408;color:#00d4ff;padding:40px"><h1>ASTRA Report</h1><h2>${esc(s.name)}</h2><p>Type: ${esc(s.type)}</p><p>Status: ${esc(s.status)}</p></body></html>`);
}));

module.exports = router;
