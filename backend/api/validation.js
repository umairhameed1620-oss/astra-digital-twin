// Validation of ASTRA's predictions against CDMs: run, history, cumulative statistics, CSV and PDF export.
const express = require('express');
const { z } = require('zod');
const { auth, canWrite } = require('../lib/auth');
const { handle, parse, HttpError } = require('../lib/http');
const { query } = require('../lib/db');
const { audit } = require('../lib/audit');
const V = require('../lib/validation');
const report = require('../lib/validationReport');

const router = express.Router();
router.use(auth);

const busy = new Set(); // one validation at a time per team

const getRun = async (id, orgId) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new HttpError(404, 'Validation run not found');
  const r = await query('SELECT id, trigger, created_at, summary, rows FROM validation_runs WHERE id=$1 AND organisation_id=$2', [id, orgId]);
  if (!r.rows.length) throw new HttpError(404, 'Validation run not found');
  return r.rows[0];
};

router.post('/run', canWrite, handle(async (req, res) => {
  const b = parse(z.object({ spacecraftIds: z.array(z.string().uuid()).max(100).optional() }), req.body || {});
  if (busy.has(req.user.orgId)) throw new HttpError(409, 'A validation run is already in progress');
  busy.add(req.user.orgId);
  try {
    const run = await V.run({ orgId: req.user.orgId, userId: req.user.id }, { spacecraftIds: b.spacecraftIds, trigger: 'manual' });
    await audit(req, 'validation_run', 'validation', run.id, { compared: run.summary.compared, cdms: run.summary.cdms });
    res.status(201).json(run);
  } finally {
    busy.delete(req.user.orgId);
  }
}));

router.get('/', handle(async (req, res) => {
  const r = await query(
    'SELECT id, trigger, created_at, summary FROM validation_runs WHERE organisation_id=$1 ORDER BY created_at DESC LIMIT 60', [req.user.orgId]
  );
  res.json({ data: r.rows });
}));

router.get('/summary', handle(async (req, res) => {
  const latest = (await query(
    'SELECT id, trigger, created_at, summary, rows FROM validation_runs WHERE organisation_id=$1 ORDER BY created_at DESC LIMIT 1', [req.user.orgId]
  )).rows[0] || null;
  res.json({ cumulative: await V.cumulative(req.user.orgId), latest });
}));

router.get('/:id', handle(async (req, res) => res.json(await getRun(req.params.id, req.user.orgId))));

router.get('/:id/export.csv', handle(async (req, res) => {
  const run = await getRun(req.params.id, req.user.orgId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="astra-validation-${new Date(run.created_at).toISOString().slice(0, 10)}.csv"`);
  res.send(V.csv(run.rows || []));
}));

router.get('/:id/report.pdf', handle(async (req, res) => {
  const run = await getRun(req.params.id, req.user.orgId);
  const buf = await report.build({ run, cumulative: await V.cumulative(req.user.orgId), user: req.user });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="astra-validation-${new Date(run.created_at).toISOString().slice(0, 10)}.pdf"`);
  res.send(buf);
}));

module.exports = router;
