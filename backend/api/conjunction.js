// Conjunction screening, manoeuvre trade study and PDF report for a twin.
const express = require('express');
const { auth } = require('../lib/auth');
const { handle, HttpError } = require('../lib/http');
const { query } = require('../lib/db');
const { audit } = require('../lib/audit');
const conj = require('../utils/conjunction');
const manoeuvre = require('../lib/manoeuvre');
const pdf = require('../lib/report');
const { getOwned, fleetOf } = require('./spacecraft');

const router = express.Router();
router.use(auth);

// Plans are expensive (several re-screenings); reuse them while the underlying screening is unchanged.
const plans = new WeakMap();
const planFor = async (base, sc, threatId) => {
  const key = `${threatId || ''}:${JSON.stringify(sc.config)}`;
  let m = plans.get(base);
  if (!m) { m = new Map(); plans.set(base, m); }
  if (!m.has(key)) m.set(key, manoeuvre.plan(base, sc, conj.rescreen, { threatId }).catch((e) => { m.delete(key); throw e; }));
  return m.get(key);
};

const screenable = (sc) => {
  if (!['satellite', 'station'].includes(sc.type)) throw new HttpError(422, `Conjunction screening applies to orbiting spacecraft, not type "${sc.type}"`);
};

router.get('/:id', handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.id);
  screenable(sc);
  const report = await conj.screen(sc, await fleetOf(req.user.id));
  const cdm = await query('SELECT COUNT(*)::int AS n FROM cdms WHERE spacecraft_id=$1 AND tca > NOW()', [sc.id]);
  res.json({ ...report, upcomingCdms: cdm.rows[0].n, lastAutomaticScreening: sc.last_screened_at });
}));

router.get('/:id/manoeuvre', handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.id);
  screenable(sc);
  const base = await conj.screenDetailed(sc, await fleetOf(req.user.id));
  res.json(await planFor(base, sc, req.query.threat ? String(req.query.threat).slice(0, 80) : undefined));
}));

router.get('/:id/report.pdf', handle(async (req, res) => {
  const sc = await getOwned(req.params.id, req.user.id);
  screenable(sc);
  const base = await conj.screenDetailed(sc, await fleetOf(req.user.id));
  const plan = await planFor(base, sc, req.query.threat ? String(req.query.threat).slice(0, 80) : undefined);
  const cdms = (await query('SELECT * FROM cdms WHERE spacecraft_id=$1 AND tca > NOW() - INTERVAL \'1 day\' ORDER BY tca ASC LIMIT 20', [sc.id])).rows;
  const buf = await pdf.build({ sc, report: base.report, manoeuvre: plan, cdms, user: req.user });
  await audit(req, 'report_generated', 'spacecraft', sc.id, {});
  const safe = String(sc.name).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'spacecraft';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ASTRA_${safe}_${new Date().toISOString().slice(0, 10)}.pdf"`);
  res.send(buf);
}));

module.exports = router;
