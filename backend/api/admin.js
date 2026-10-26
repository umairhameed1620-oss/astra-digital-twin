// Administration (admin role only): platform stats, user management, audit trail.
const express = require('express');
const { z } = require('zod');
const { query } = require('../lib/db');
const { auth, requireRole } = require('../lib/auth');
const { handle, parse, HttpError } = require('../lib/http');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(auth, requireRole('admin'));

router.get('/stats', handle(async (req, res) => {
  const one = async (sql) => (await query(sql)).rows[0];
  const [users, spacecraft, missions, events, alerts, cdms] = await Promise.all([
    one("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS new_7d FROM users"),
    one("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status IN ('launched','operational'))::int AS in_orbit, COUNT(*) FILTER (WHERE status='simulating')::int AS simulating FROM spacecraft WHERE is_deleted=false"),
    one("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='active')::int AS active FROM missions WHERE is_deleted=false"),
    one("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE severity='critical')::int AS critical FROM conjunction_events WHERE tca > NOW()"),
    one("SELECT COUNT(*)::int AS total FROM alerts WHERE created_at > NOW() - INTERVAL '7 days'"),
    one('SELECT COUNT(*)::int AS total FROM cdms'),
  ]);
  res.json({
    users, spacecraft, missions, conjunctions: events, alerts7d: alerts, cdms,
    faults: { total: 0, critical: events.critical }, ai: { total: 0, tokens: 0 }, telemetry: { total: 0 },
  });
}));

router.get('/users', handle(async (req, res) => {
  const r = await query(
    `SELECT u.id, u.name, u.email, o.name AS organisation, u.org_role, u.role, u.is_active, u.totp_enabled, u.last_login_at, u.created_at
       FROM users u JOIN organisations o ON o.id = u.organisation_id ORDER BY u.created_at DESC`
  );
  res.json({ data: r.rows, pagination: { total: r.rows.length } });
}));

router.patch('/users/:id', handle(async (req, res) => {
  const b = parse(z.object({ role: z.enum(['admin', 'engineer', 'viewer']).optional(), is_active: z.boolean().optional() }), req.body);
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'User not found');
  if (req.params.id === req.user.id && (b.role && b.role !== 'admin' || b.is_active === false)) {
    throw new HttpError(400, 'You cannot demote or disable your own admin account');
  }
  const r = await query(
    'UPDATE users SET role=COALESCE($1,role), is_active=COALESCE($2,is_active), updated_at=NOW() WHERE id=$3 RETURNING id,name,email,role,is_active',
    [b.role ?? null, b.is_active ?? null, req.params.id]
  );
  if (!r.rows.length) throw new HttpError(404, 'User not found');
  await audit(req, 'user_updated', 'user', req.params.id, b);
  res.json({ message: 'Updated', user: r.rows[0] });
}));

// Support: a user lost their phone and recovery codes. They log in with password only and set 2FA up again.
router.post('/users/:id/reset-2fa', handle(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'User not found');
  const r = await query(
    `UPDATE users SET totp_enabled=false, totp_secret=NULL, totp_pending_secret=NULL, totp_last_step=NULL, recovery_codes='[]', totp_enabled_at=NULL
      WHERE id=$1 RETURNING id, email`, [req.params.id]
  );
  if (!r.rows.length) throw new HttpError(404, 'User not found');
  await audit(req, '2fa_reset_by_admin', 'user', req.params.id, { email: r.rows[0].email });
  res.json({ message: 'Two-factor login reset', user: r.rows[0] });
}));

router.get('/audit', handle(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const r = await query(
    `SELECT a.id, a.action, a.resource_type, a.resource_id, a.details, a.ip_address, a.created_at, u.email AS user_email, u.name AS user_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT $1`, [limit]
  );
  res.json({ data: r.rows, pagination: { total: r.rows.length } });
}));

module.exports = router;
