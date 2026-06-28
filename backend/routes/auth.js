const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, auditLog } = require('../utils/database');
const { generateTokens, verifyRefreshToken } = require('../security/jwt');
const { cache } = require('../utils/redis');
const { validate } = require('../validation/validate');
const { registerSchema, loginSchema, refreshTokenSchema } = require('../validation/schemas');
const { authLimiter } = require('../security');
const { NotFoundError, UnauthorizedError, ConflictError } = require('../middleware/errorHandler');
const logger = require('../monitoring/logger');
const router = express.Router();

router.post('/register', validate(registerSchema), async (req, res) => {
  const { name, email, password, organisation } = req.body;

  const exists = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (exists.rows.length > 0) throw new ConflictError('Email already registered');

  const hashedPassword = await bcrypt.hash(password, 12);
  const id = uuidv4();

  const result = await query(
    'INSERT INTO users (id,name,email,password,organisation,role,created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id,name,email,organisation,role',
    [id, name, email, hashedPassword, organisation || null, 'engineer']
  );

  const user = result.rows[0];
  const { accessToken, refreshToken } = generateTokens({ id: user.id, name: user.name, email: user.email, role: user.role });
  await cache.setRefreshToken(user.id, refreshToken);
  await auditLog(user.id, 'register', 'user', user.id, { ip: req.ip });

  logger.info('User registered', { userId: user.id, email: user.email });
  res.status(201).json({ token: accessToken, refreshToken, user });
});

router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const result = await query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
  if (result.rows.length === 0) throw new UnauthorizedError('Invalid credentials');

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    await auditLog(user.id, 'login_failed', 'user', user.id, { ip: req.ip });
    throw new UnauthorizedError('Invalid credentials');
  }

  const { accessToken, refreshToken } = generateTokens({ id: user.id, name: user.name, email: user.email, role: user.role });
  await cache.setRefreshToken(user.id, refreshToken);
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  await auditLog(user.id, 'login', 'user', user.id, { ip: req.ip });

  logger.info('User logged in', { userId: user.id });
  res.json({
    token: accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, organisation: user.organisation }
  });
});

router.post('/refresh', validate(refreshTokenSchema), async (req, res) => {
  const { refreshToken } = req.body;
  const decoded = verifyRefreshToken(refreshToken);

  const result = await query('SELECT id,name,email,role,is_active FROM users WHERE id = $1', [decoded.id]);
  if (result.rows.length === 0 || !result.rows[0].is_active) throw new UnauthorizedError('User not found');

  const user = result.rows[0];
  const tokens = generateTokens({ id: user.id, name: user.name, email: user.email, role: user.role });
  await cache.invalidateRefreshToken(user.id, refreshToken);
  await cache.setRefreshToken(user.id, tokens.refreshToken);

  res.json({ token: tokens.accessToken, refreshToken: tokens.refreshToken });
});

router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      await cache.invalidateRefreshToken(decoded.id, refreshToken);
    } catch { /* already expired */ }
  }
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
