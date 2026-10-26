// Sign-up, login (with optional two-factor step), session refresh and two-factor management.
const express = require('express');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { query } = require('../lib/db');
const {
  sign, signChallenge, verifyChallenge, adminEmails, auth, authAllowSetup, loadUser,
} = require('../lib/auth');
const { handle, parse, HttpError } = require('../lib/http');
const { audit } = require('../lib/audit');
const TOTP = require('../lib/totp');
const team = require('../lib/team');

const router = express.Router();

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(150),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
  organisation: z.string().trim().max(150).optional().nullable(),
  inviteToken: z.string().max(200).optional().nullable(),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
const codeSchema = z.object({ code: z.string().trim().min(6).max(20) });

const DUMMY_HASH = '$2a$12$Y7wBI87dFz9WOkmbobZVO.mnMK0ABZdK8dRIAcPigD91wI0tqrpCO';

const session = async (userId) => {
  const u = await loadUser(userId);
  return { token: sign(u), refreshToken: sign(u), user: publicUser(u) };
};

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, organisation: u.orgName,
  orgId: u.orgId, orgRole: u.orgRole, totpEnabled: !!u.totpEnabled, mustSetup2fa: !!u.mustSetup2fa,
});

router.post('/register', handle(async (req, res) => {
  const b = parse(registerSchema, req.body);
  const invite = b.inviteToken ? await team.findInvite(b.inviteToken) : null;
  if (b.inviteToken && !invite) throw new HttpError(410, 'This invitation has expired or was already used. Ask your team for a new one.');
  if (invite && invite.email.toLowerCase() !== b.email) throw new HttpError(403, `This invitation is for ${invite.email}. Register with that email address.`);
  if (!invite && process.env.ALLOW_REGISTRATION === 'false') throw new HttpError(403, 'Self-registration is disabled. Ask your team for an invitation.');

  const exists = await query('SELECT id FROM users WHERE lower(email)=$1', [b.email]);
  if (exists.rows.length) throw new HttpError(409, 'Email already registered. Log in instead; you can accept the invitation after logging in.');
  const role = adminEmails().includes(b.email) ? 'admin' : 'engineer';
  const hashed = await bcrypt.hash(b.password, 12);
  const id = uuidv4();

  await team.tx(async (c) => {
    let orgId; let orgRole;
    if (invite) {
      orgId = invite.organisation_id; orgRole = invite.role;
      await c.query('UPDATE invitations SET accepted_at=NOW() WHERE id=$1', [invite.id]);
    } else {
      const org = await team.createOrg(c, b.organisation || `${b.name}'s team`);
      orgId = org.id; orgRole = 'owner';
    }
    await c.query(
      `INSERT INTO users (id,name,email,password,organisation,role,is_active,created_at,last_login_at,organisation_id,org_role)
       VALUES ($1,$2,$3,$4,$5,$6,true,NOW(),NOW(),$7,$8)`,
      [id, b.name, b.email, hashed, b.organisation || null, role, orgId, orgRole]
    );
  });
  req.user = { id };
  await audit(req, 'user_registered', 'user', id, { email: b.email, role, invited: !!invite });
  res.status(201).json(await session(id));
}));

router.post('/login', handle(async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const r = await query('SELECT * FROM users WHERE lower(email)=$1', [email]);
  const user = r.rows[0];
  // Always run bcrypt so response time does not reveal whether the email exists.
  const valid = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !valid) {
    await audit({ headers: req.headers, ip: req.ip, user: user ? { id: user.id } : null }, 'login_failed', 'user', user ? user.id : null, { email });
    throw new HttpError(401, 'Invalid credentials');
  }
  if (!user.is_active) throw new HttpError(403, 'Account disabled');
  if (adminEmails().includes(email) && user.role !== 'admin') await query("UPDATE users SET role='admin' WHERE id=$1", [user.id]);
  req.user = { id: user.id };
  if (user.totp_enabled) {
    await audit(req, 'login_password_ok', 'user', user.id, {});
    return res.json({ twoFactorRequired: true, challenge: signChallenge(user) });
  }
  await query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);
  await audit(req, 'login', 'user', user.id, {});
  return res.json(await session(user.id));
}));

// Second login step: authenticator code or a one-time recovery code.
router.post('/2fa/verify', handle(async (req, res) => {
  const b = parse(z.object({ challenge: z.string().min(10).max(2000), code: z.string().trim().min(6).max(20) }), req.body);
  let p;
  try { p = verifyChallenge(b.challenge); } catch (e) { throw new HttpError(401, 'Login step expired. Enter your email and password again.'); }
  const u = (await query('SELECT id, is_active, totp_enabled, totp_secret, totp_last_step, recovery_codes FROM users WHERE id=$1', [p.id])).rows[0];
  if (!u || !u.is_active || !u.totp_enabled) throw new HttpError(401, 'Login step expired. Enter your email and password again.');
  req.user = { id: u.id };

  const code = b.code.replace(/\s/g, '');
  let ok = false;
  if (/^\d{6}$/.test(code)) {
    const step = TOTP.verify(TOTP.decrypt(u.totp_secret), code, { lastStep: u.totp_last_step });
    if (step != null) {
      // Conditional update: two simultaneous requests with the same code cannot both succeed.
      const upd = await query('UPDATE users SET totp_last_step=$1 WHERE id=$2 AND (totp_last_step IS NULL OR totp_last_step < $1)', [step, u.id]);
      ok = upd.rowCount === 1;
    }
  } else {
    const h = TOTP.hashCode(code);
    const codes = Array.isArray(u.recovery_codes) ? u.recovery_codes : [];
    if (codes.includes(h)) {
      const upd = await query(
        'UPDATE users SET recovery_codes = recovery_codes - $1::text WHERE id=$2 AND recovery_codes ? $1::text', [h, u.id]
      );
      ok = upd.rowCount === 1;
      if (ok) await audit(req, '2fa_recovery_code_used', 'user', u.id, { remaining: codes.length - 1 });
    }
  }
  if (!ok) {
    await audit(req, '2fa_failed', 'user', u.id, {});
    throw new HttpError(401, 'That code is not valid. Check the time on your phone, or use a recovery code.');
  }
  await query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [u.id]);
  await audit(req, 'login', 'user', u.id, { twoFactor: true });
  res.json(await session(u.id));
}));

router.get('/me', authAllowSetup, (req, res) => res.json({ user: publicUser(req.user) }));

// Tokens are short-lived JWTs; refresh re-issues one for a still-valid session.
router.post('/refresh', authAllowSetup, (req, res) => {
  const token = sign(req.user);
  res.json({ token, refreshToken: token, user: publicUser(req.user) });
});
router.post('/logout', (req, res) => res.json({ message: 'Logged out' }));

// ---- two-factor management ----
router.get('/2fa', authAllowSetup, handle(async (req, res) => {
  const u = (await query('SELECT totp_enabled, totp_enabled_at, recovery_codes FROM users WHERE id=$1', [req.user.id])).rows[0];
  res.json({
    enabled: u.totp_enabled, enabledAt: u.totp_enabled_at,
    recoveryCodesLeft: Array.isArray(u.recovery_codes) ? u.recovery_codes.length : 0,
    requiredByTeam: req.user.mustSetup2fa || undefined,
  });
}));

router.post('/2fa/setup', authAllowSetup, handle(async (req, res) => {
  if (req.user.totpEnabled) throw new HttpError(409, 'Two-factor login is already on. Turn it off first to set up a new device.');
  const secret = TOTP.generateSecret();
  await query('UPDATE users SET totp_pending_secret=$1 WHERE id=$2', [TOTP.encrypt(secret), req.user.id]);
  const url = TOTP.otpauthUrl(secret, req.user.email, process.env.TOTP_ISSUER || 'ASTRA');
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  res.json({ secret: secret.match(/.{1,4}/g).join(' '), otpauthUrl: url, qr });
}));

router.post('/2fa/enable', authAllowSetup, handle(async (req, res) => {
  const { code } = parse(codeSchema, req.body);
  const u = (await query('SELECT totp_pending_secret, totp_enabled FROM users WHERE id=$1', [req.user.id])).rows[0];
  if (u.totp_enabled) throw new HttpError(409, 'Two-factor login is already on');
  if (!u.totp_pending_secret) throw new HttpError(400, 'Start the setup first');
  const secret = TOTP.decrypt(u.totp_pending_secret);
  const step = TOTP.verify(secret, code);
  if (step == null) throw new HttpError(400, 'That code is not valid. Make sure the phone clock is set automatically, then try the newest code.');
  const codes = TOTP.newRecoveryCodes();
  await query(
    `UPDATE users SET totp_enabled=true, totp_secret=$1, totp_pending_secret=NULL, totp_last_step=$2, totp_enabled_at=NOW(),
       recovery_codes=$3 WHERE id=$4`,
    [u.totp_pending_secret, step, JSON.stringify(codes.map(TOTP.hashCode)), req.user.id]
  );
  await audit(req, '2fa_enabled', 'user', req.user.id, {});
  const s = await session(req.user.id);
  res.json({ ...s, recoveryCodes: codes });
}));

const checkPasswordAndCode = async (userId, password, code) => {
  const u = (await query('SELECT password, totp_secret, totp_last_step FROM users WHERE id=$1', [userId])).rows[0];
  if (!(await bcrypt.compare(password, u.password))) throw new HttpError(401, 'Wrong password');
  const step = TOTP.verify(TOTP.decrypt(u.totp_secret), code, { lastStep: u.totp_last_step });
  if (step == null) throw new HttpError(401, 'That code is not valid');
  await query('UPDATE users SET totp_last_step=$1 WHERE id=$2', [step, userId]);
};

router.post('/2fa/disable', auth, handle(async (req, res) => {
  const b = parse(z.object({ password: z.string().min(1).max(200), code: z.string().trim().min(6).max(10) }), req.body);
  if (!req.user.totpEnabled) throw new HttpError(409, 'Two-factor login is not on');
  const org = (await query('SELECT require_2fa FROM organisations WHERE id=$1', [req.user.orgId])).rows[0];
  if (org.require_2fa) throw new HttpError(403, 'Your team requires two-factor login, so it cannot be turned off.');
  await checkPasswordAndCode(req.user.id, b.password, b.code);
  await query("UPDATE users SET totp_enabled=false, totp_secret=NULL, totp_pending_secret=NULL, totp_last_step=NULL, recovery_codes='[]', totp_enabled_at=NULL WHERE id=$1", [req.user.id]);
  await audit(req, '2fa_disabled', 'user', req.user.id, {});
  res.json({ enabled: false });
}));

router.post('/2fa/recovery-codes', auth, handle(async (req, res) => {
  const b = parse(z.object({ password: z.string().min(1).max(200), code: z.string().trim().min(6).max(10) }), req.body);
  if (!req.user.totpEnabled) throw new HttpError(409, 'Two-factor login is not on');
  await checkPasswordAndCode(req.user.id, b.password, b.code);
  const codes = TOTP.newRecoveryCodes();
  await query('UPDATE users SET recovery_codes=$1 WHERE id=$2', [JSON.stringify(codes.map(TOTP.hashCode)), req.user.id]);
  await audit(req, '2fa_recovery_codes_regenerated', 'user', req.user.id, {});
  res.json({ recoveryCodes: codes });
}));

module.exports = router;
