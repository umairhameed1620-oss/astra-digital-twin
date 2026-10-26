// Missions: list, create, lifecycle status (planning -> active -> completed, or aborted).
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { query } = require('../lib/db');
const { auth, canWrite } = require('../lib/auth');
const { handle, parse, HttpError } = require('../lib/http');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(auth);

const TRANSITIONS = {
  planning: ['active', 'aborted'],
  active: ['completed', 'aborted', 'planning'],
  completed: ['active'],
  aborted: ['planning'],
};

const createSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().max(5000).optional().nullable(),
  objectives: z.array(z.string().max(500)).max(50).optional(),
  timeline: z.array(z.any()).max(200).optional(),
  spacecraftId: z.string().uuid().optional().nullable(),
  spacecraft_id: z.string().uuid().optional().nullable(),
});

const LIST_SQL = `SELECT m.*, s.name AS spacecraft_name FROM missions m
  LEFT JOIN spacecraft s ON m.spacecraft_id = s.id AND s.is_deleted = false
  WHERE m.organisation_id = $1 AND m.is_deleted = false`;

router.get('/', handle(async (req, res) => {
  const r = await query(`${LIST_SQL} ORDER BY m.created_at DESC`, [req.user.orgId]);
  res.json({ data: r.rows, pagination: { total: r.rows.length, page: 1, limit: r.rows.length, totalPages: 1 } });
}));

router.post('/', canWrite, handle(async (req, res) => {
  const b = parse(createSchema, req.body);
  const scId = b.spacecraftId || b.spacecraft_id || null;
  if (scId) {
    const ok = await query('SELECT 1 FROM spacecraft WHERE id=$1 AND organisation_id=$2 AND is_deleted=false', [scId, req.user.orgId]);
    if (!ok.rows.length) throw new HttpError(422, 'Spacecraft not found');
  }
  const id = uuidv4();
  await query(
    `INSERT INTO missions (id,user_id,organisation_id,spacecraft_id,name,description,objectives,timeline,status,is_deleted,created_at)
     VALUES ($1,$2,$8,$3,$4,$5,$6,$7,'planning',false,NOW())`,
    [id, req.user.id, scId, b.name, b.description || null, JSON.stringify(b.objectives || []), JSON.stringify(b.timeline || []), req.user.orgId]
  );
  await audit(req, 'mission_created', 'mission', id, { name: b.name });
  const r = await query(`${LIST_SQL} AND m.id = $2`, [req.user.orgId, id]);
  res.status(201).json(r.rows[0]);
}));

router.put('/:id/status', canWrite, handle(async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['planning', 'active', 'completed', 'aborted']) }), req.body);
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'Mission not found');
  const cur = (await query('SELECT * FROM missions WHERE id=$1 AND organisation_id=$2 AND is_deleted=false', [req.params.id, req.user.orgId])).rows[0];
  if (!cur) throw new HttpError(404, 'Mission not found');
  if (!TRANSITIONS[cur.status] || !TRANSITIONS[cur.status].includes(status)) {
    throw new HttpError(409, `Cannot change a ${cur.status} mission to ${status}`);
  }
  await query(
    `UPDATE missions SET status=$1::varchar,
       started_at = CASE WHEN $1::varchar='active' AND started_at IS NULL THEN NOW() ELSE started_at END,
       completed_at = CASE WHEN $1::varchar IN ('completed','aborted') THEN NOW() WHEN $1::varchar IN ('planning','active') THEN NULL ELSE completed_at END,
       updated_at=NOW()
     WHERE id=$2`,
    [status, cur.id]
  );
  await audit(req, 'mission_status_changed', 'mission', cur.id, { from: cur.status, to: status });
  const r = await query(`${LIST_SQL} AND m.id = $2`, [req.user.orgId, cur.id]);
  res.json(r.rows[0]);
}));

router.delete('/:id', canWrite, handle(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'Mission not found');
  const r = await query('UPDATE missions SET is_deleted=true, updated_at=NOW() WHERE id=$1 AND organisation_id=$2 AND is_deleted=false RETURNING id', [req.params.id, req.user.orgId]);
  if (!r.rows.length) throw new HttpError(404, 'Mission not found');
  await audit(req, 'mission_deleted', 'mission', req.params.id, {});
  res.json({ message: 'Deleted', id: req.params.id });
}));

module.exports = router;
