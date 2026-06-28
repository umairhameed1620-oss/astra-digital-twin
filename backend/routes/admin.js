const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../security/rbac');
const { query, queryPaginated } = require('../utils/database');
const { cache } = require('../utils/redis');
const { validate } = require('../validation/validate');
const { paginationSchema } = require('../validation/schemas');
const logger = require('../monitoring/logger');
const router = express.Router();

router.use(authenticate);
router.use(requireRole('admin'));

// GET /api/admin/stats — system-wide stats
router.get('/stats', async (req, res) => {
  const cacheKey = 'admin:stats';
  const cached = await cache.get(cacheKey);
  if (cached) return res.json(cached);

  const [users, spacecraft, missions, telemetry, faults, aiConvs] = await Promise.all([
    query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active) as active, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL \'7 days\') as new_7d FROM users'),
    query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status=\'simulating\') as simulating, COUNT(*) FILTER (WHERE is_deleted) as deleted FROM spacecraft'),
    query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status=\'active\') as active FROM missions'),
    query('SELECT COUNT(*) as total FROM telemetry_logs'),
    query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE severity=\'critical\') as critical FROM fault_events'),
    query('SELECT COUNT(*) as total, SUM(tokens_used) as tokens FROM ai_conversations'),
  ]);

  const result = {
    users: users.rows[0],
    spacecraft: spacecraft.rows[0],
    missions: missions.rows[0],
    telemetry: telemetry.rows[0],
    faults: faults.rows[0],
    ai: aiConvs.rows[0],
    generatedAt: new Date().toISOString(),
  };

  await cache.set(cacheKey, result, 60);
  res.json(result);
});

// GET /api/admin/users — list all users
router.get('/users', validate(paginationSchema, 'query'), async (req, res) => {
  const { page, limit, search } = req.query;
  let baseQuery = 'SELECT id,name,email,organisation,role,is_active,last_login_at,created_at FROM users';
  const params = [];
  if (search) { baseQuery += ' WHERE name ILIKE $1 OR email ILIKE $1'; params.push(`%${search}%`); }
  baseQuery += ' ORDER BY created_at DESC';
  const result = await queryPaginated(baseQuery, params, { page, limit });
  res.json(result);
});

// PATCH /api/admin/users/:id — update user role or status
router.patch('/users/:id', async (req, res) => {
  const { role, is_active } = req.body;
  const updates = [];
  const params = [];

  if (role && ['admin', 'engineer', 'viewer'].includes(role)) {
    updates.push(`role = $${params.length + 1}`); params.push(role);
  }
  if (typeof is_active === 'boolean') {
    updates.push(`is_active = $${params.length + 1}`); params.push(is_active);
  }
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  params.push(req.params.id);
  const result = await query(
    `UPDATE users SET ${updates.join(', ')}, updated_at=NOW() WHERE id=$${params.length} RETURNING id,name,email,role,is_active`,
    params
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

  logger.info('Admin updated user', { adminId: req.user.id, targetUserId: req.params.id, changes: req.body });
  res.json(result.rows[0]);
});

// GET /api/admin/audit — audit log
router.get('/audit', validate(paginationSchema, 'query'), async (req, res) => {
  const { page, limit } = req.query;
  const baseQuery = `
    SELECT al.*, u.name as user_name, u.email as user_email
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC
  `;
  const result = await queryPaginated(baseQuery, [], { page, limit });
  res.json(result);
});

// GET /api/admin/spacecraft — all spacecraft across all users
router.get('/spacecraft', validate(paginationSchema, 'query'), async (req, res) => {
  const { page, limit } = req.query;
  const baseQuery = `
    SELECT s.*, u.name as user_name, u.email as user_email
    FROM spacecraft s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.is_deleted = false
    ORDER BY s.created_at DESC
  `;
  const result = await queryPaginated(baseQuery, [], { page, limit });
  res.json(result);
});

// DELETE /api/admin/users/:id — permanently delete user
router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  await query('DELETE FROM users WHERE id=$1', [req.params.id]);
  logger.warn('Admin deleted user', { adminId: req.user.id, deletedUserId: req.params.id });
  res.json({ message: 'User permanently deleted', id: req.params.id });
});

module.exports = router;
