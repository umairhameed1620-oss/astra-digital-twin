// Team (organisation) management: members, roles, invitations, ownership, 2FA policy.
const express = require('express');
const { z } = require('zod');
const { query } = require('../lib/db');
const { auth, authAllowSetup, canManageTeam, requireOrgRole } = require('../lib/auth');
const { handle, parse, HttpError } = require('../lib/http');
const { audit } = require('../lib/audit');
const team = require('../lib/team');
const notify = require('../lib/notify');

const router = express.Router();

const ROLE_RANK = { viewer: 0, engineer: 1, admin: 2, owner: 3 };
const uuid = z.string().uuid();

const publicBase = (req) => {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  if (process.env.ASTRA_DOMAIN) return `https://${process.env.ASTRA_DOMAIN}`;
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/[^/\s]+$/.test(origin)) return origin;
  return 'http://localhost';
};

// ---- public: look up an invitation (shown on the sign-up screen) ----
router.get('/invitations/lookup/:token', handle(async (req, res) => {
  const inv = await team.findInvite(req.params.token);
  if (!inv) throw new HttpError(404, 'This invitation has expired or was already used.');
  const registered = (await query('SELECT 1 FROM users WHERE lower(email)=$1', [inv.email.toLowerCase()])).rows.length > 0;
  res.json({ team: inv.org_name, email: inv.email, role: inv.role, expiresAt: inv.expires_at, registered });
}));

// Accepting is allowed before 2FA setup so a new member can join a team that then asks them for it.
router.post('/invitations/accept', authAllowSetup, handle(async (req, res) => {
  const { token } = parse(z.object({ token: z.string().min(20).max(200) }), req.body);
  const inv = await team.findInvite(token);
  if (!inv) throw new HttpError(410, 'This invitation has expired or was already used.');
  if (inv.email.toLowerCase() !== req.user.email.toLowerCase()) throw new HttpError(403, `This invitation is for ${inv.email}. Log in with that account to accept it.`);
  let moved;
  try { moved = await team.acceptInvite(inv, req.user.id); } catch (e) { throw new HttpError(e.status || 500, e.message); }
  await audit(req, 'team_joined', 'organisation', inv.organisation_id, { role: inv.role, moved });
  res.json({ team: inv.org_name, role: inv.role, moved });
}));

router.use(auth);

router.get('/', handle(async (req, res) => {
  const org = (await query('SELECT id, name, require_2fa, created_at FROM organisations WHERE id=$1', [req.user.orgId])).rows[0];
  const members = (await query(
    `SELECT id, name, email, org_role, totp_enabled, last_login_at, created_at, is_active FROM users
      WHERE organisation_id=$1 ORDER BY CASE org_role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'engineer' THEN 2 ELSE 3 END, name`, [req.user.orgId]
  )).rows;
  const canManage = ['owner', 'admin'].includes(req.user.orgRole);
  const invitations = canManage ? (await query(
    `SELECT i.id, i.email, i.role, i.created_at, i.expires_at, u.name AS invited_by FROM invitations i LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.organisation_id=$1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > NOW() ORDER BY i.created_at DESC`, [req.user.orgId]
  )).rows : [];
  const counts = (await query(
    `SELECT (SELECT COUNT(*)::int FROM spacecraft WHERE organisation_id=$1 AND is_deleted=false) AS spacecraft,
            (SELECT COUNT(*)::int FROM missions WHERE organisation_id=$1 AND is_deleted=false) AS missions`, [req.user.orgId]
  )).rows[0];
  res.json({
    team: { id: org.id, name: org.name, require2fa: org.require_2fa, createdAt: org.created_at, ...counts },
    me: { id: req.user.id, role: req.user.orgRole },
    members: members.map((m) => ({
      id: m.id, name: m.name, email: m.email, role: m.org_role, twoFactor: m.totp_enabled, lastLoginAt: m.last_login_at, active: m.is_active,
    })),
    invitations,
    emailConfigured: notify.smtpConfigured(),
  });
}));

router.patch('/', canManageTeam, handle(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1).max(150).optional(), require2fa: z.boolean().optional() }), req.body);
  if (b.require2fa === true && !req.user.totpEnabled) throw new HttpError(400, 'Turn on two-factor login for your own account first.');
  const cur = (await query('SELECT * FROM organisations WHERE id=$1', [req.user.orgId])).rows[0];
  const r = await query('UPDATE organisations SET name=$1, require_2fa=$2 WHERE id=$3 RETURNING id, name, require_2fa',
    [b.name ?? cur.name, b.require2fa ?? cur.require_2fa, req.user.orgId]);
  await audit(req, 'team_updated', 'organisation', req.user.orgId, b);
  res.json({ id: r.rows[0].id, name: r.rows[0].name, require2fa: r.rows[0].require_2fa });
}));

router.post('/invitations', canManageTeam, handle(async (req, res) => {
  const b = parse(z.object({
    email: z.string().trim().toLowerCase().email().max(150),
    role: z.enum(['admin', 'engineer', 'viewer']).default('engineer'),
  }), req.body);
  if (b.role === 'admin' && req.user.orgRole !== 'owner') throw new HttpError(403, 'Only the owner can invite admins');
  const member = (await query('SELECT 1 FROM users WHERE lower(email)=$1 AND organisation_id=$2', [b.email, req.user.orgId])).rows.length;
  if (member) throw new HttpError(409, 'That person is already in your team');
  const inv = await team.createInvite({ orgId: req.user.orgId, email: b.email, role: b.role, invitedBy: req.user.id });
  const link = `${publicBase(req)}/?invite=${inv.token}`;
  let emailed = false; let emailError = null;
  if (notify.smtpConfigured()) {
    try {
      await notify.sendEmail(b.email, `${req.user.name} invited you to ${req.user.orgName} on ASTRA`, [
        `${req.user.name} has invited you to join the team "${req.user.orgName}" on ASTRA as ${b.role}.`,
        '', `Accept the invitation: ${link}`, '',
        `The link works once and expires in ${team.INVITE_DAYS} days. If you were not expecting this, ignore this email.`,
      ].join('\n'));
      emailed = true;
    } catch (e) { emailError = e.message; }
  }
  await audit(req, 'team_invited', 'organisation', req.user.orgId, { email: b.email, role: b.role, emailed });
  res.status(201).json({ id: inv.id, email: inv.email, role: inv.role, expiresAt: inv.expires_at, link, emailed, emailError });
}));

router.delete('/invitations/:id', canManageTeam, handle(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const r = await query('UPDATE invitations SET revoked_at=NOW() WHERE id=$1 AND organisation_id=$2 AND accepted_at IS NULL RETURNING id', [id, req.user.orgId]);
  if (!r.rows.length) throw new HttpError(404, 'Invitation not found');
  await audit(req, 'team_invite_revoked', 'organisation', req.user.orgId, { invitation: id });
  res.json({ id });
}));

const memberOf = async (id, orgId) => {
  const m = (await query('SELECT id, name, email, org_role FROM users WHERE id=$1 AND organisation_id=$2', [id, orgId])).rows[0];
  if (!m) throw new HttpError(404, 'Member not found');
  return m;
};

router.patch('/members/:id', canManageTeam, handle(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { role } = parse(z.object({ role: z.enum(['admin', 'engineer', 'viewer']) }), req.body);
  if (id === req.user.id) throw new HttpError(400, 'You cannot change your own role');
  const m = await memberOf(id, req.user.orgId);
  if (m.org_role === 'owner') throw new HttpError(403, 'The owner\'s role changes only by handing over ownership');
  // Admins manage engineers and viewers; only the owner manages admins.
  if (req.user.orgRole !== 'owner' && (m.org_role === 'admin' || role === 'admin')) throw new HttpError(403, 'Only the owner can change admins');
  await query('UPDATE users SET org_role=$1 WHERE id=$2', [role, id]);
  await audit(req, 'team_role_changed', 'user', id, { from: m.org_role, to: role });
  res.json({ id, role });
}));

router.delete('/members/:id', handle(async (req, res) => {
  const self = req.params.id === 'me' || req.params.id === req.user.id;
  const id = self ? req.user.id : parse(uuid, req.params.id);
  const m = await memberOf(id, req.user.orgId);
  if (m.org_role === 'owner') throw new HttpError(403, self ? 'Hand over ownership before leaving the team' : 'The owner cannot be removed');
  if (!self) {
    if (!['owner', 'admin'].includes(req.user.orgRole)) throw new HttpError(403, 'Your team role does not allow this');
    if (ROLE_RANK[m.org_role] >= ROLE_RANK[req.user.orgRole]) throw new HttpError(403, 'Only the owner can remove admins');
  }
  const org = await team.moveToOwnTeam(id);
  await audit(req, self ? 'team_left' : 'team_member_removed', 'user', id, { team: req.user.orgId, newTeam: org.id });
  res.json({ id, removed: true });
}));

router.post('/transfer', requireOrgRole('owner'), handle(async (req, res) => {
  const { userId } = parse(z.object({ userId: uuid }), req.body);
  if (userId === req.user.id) throw new HttpError(400, 'You are already the owner');
  await memberOf(userId, req.user.orgId);
  await team.tx(async (c) => {
    await c.query("UPDATE users SET org_role='owner' WHERE id=$1 AND organisation_id=$2", [userId, req.user.orgId]);
    await c.query("UPDATE users SET org_role='admin' WHERE id=$1", [req.user.id]);
  });
  await audit(req, 'team_ownership_transferred', 'organisation', req.user.orgId, { to: userId });
  res.json({ owner: userId });
}));

module.exports = router;
