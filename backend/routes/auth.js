const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { query } = require('../lib/db');
const { sign, adminEmails, auth } = require('../lib/auth');
const { handle, parse, HttpError } = require('../lib/http');
const { audit } = require('../lib/audit');

const router = express.Router();

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(150),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
  organisation: z.string().trim().max(150).optional().nullable(),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, organisation: u.organisation });

router.post('/register', handle(async (req, res) => {
  if (process.env.ALLOW_REGISTRATION === 'false') throw new HttpError(403, 'Self-registration is disabled. Ask an administrator for an account.');
  const { name, email, password, organisation } = parse(registerSchema, req.body);
  const exists = await query('SELECT id FROM users WHERE lower(email)=$1', [email]);
  if (exists.rows.length) throw new HttpError(409, 'Email already registered');
  const role = adminEmails().includes(email) ? 'admin' : 'engineer';
  const hashed = await bcrypt.hash(password, 12);
  const id = uuidv4();
  const r = await query(
    'INSERT INTO users (id,name,email,password,organisation,role,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,true,NOW()) RETURNING *',
    [id, name, email, hashed, organisation || null, role]
  );
  const user = r.rows[0];
  req.user = { id: user.id };
  await audit(req, 'user_registered', 'user', id, { email, role });
  const token = sign(user);
  res.status(201).json({ token, refreshToken: token, user: publicUser(user) });
}));

router.post('/login', handle(async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const r = await query('SELECT * FROM users WHERE lower(email)=$1', [email]);
  let user = r.rows[0];
  // Constant-ish time: always run bcrypt so response time does not reveal whether the email exists.
  const valid = await bcrypt.compare(password, user ? user.password : '$2a$12$Y7wBI87dFz9WOkmbobZVO.mnMK0ABZdK8dRIAcPigD91wI0tqrpCO');
  if (!user || !valid) {
    await audit({ headers: req.headers, ip: req.ip, user: user ? { id: user.id } : null }, 'login_failed', 'user', user ? user.id : null, { email });
    throw new HttpError(401, 'Invalid credentials');
  }
  if (!user.is_active) throw new HttpError(403, 'Account disabled');
  if (adminEmails().includes(email) && user.role !== 'admin') {
    user = (await query("UPDATE users SET role='admin' WHERE id=$1 RETURNING *", [user.id])).rows[0];
  }
  await query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);
  req.user = { id: user.id };
  await audit(req, 'login', 'user', user.id, {});
  const token = sign(user);
  res.json({ token, refreshToken: token, user: publicUser(user) });
}));

router.get('/me', auth, (req, res) => res.json({ user: req.user }));

// Tokens are short-lived JWTs; refresh re-issues one for a still-valid session.
router.post('/refresh', auth, (req, res) => {
  const token = sign(req.user);
  res.json({ token, refreshToken: token });
});
router.post('/logout', (req, res) => res.json({ message: 'Logged out' }));

module.exports = router;
