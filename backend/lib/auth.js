// Authentication: JWT signing/verification, per-request user lookup, role checks.
const jwt = require('jsonwebtoken');
const { query } = require('./db');

const INSECURE = new Set(['', 'astra_secret_2024', 'CHANGE_THIS_IN_PRODUCTION', 'secret', 'changeme']);

const getSecret = () => {
  const s = process.env.JWT_SECRET || '';
  if (INSECURE.has(s)) {
    throw new Error('JWT_SECRET is missing or uses a known default. Set a random value of at least 32 characters in .env');
  }
  if (s.length < 32) console.warn('[warn] JWT_SECRET is shorter than 32 characters; use a longer random value');
  return s;
};

const SECRET = getSecret();
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '12h';

const sign = (user) => jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: TOKEN_TTL, issuer: 'astra' });

const adminEmails = () => (process.env.ADMIN_EMAILS || '')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

// Verifies the token and re-reads the user, so role changes and deactivation take effect immediately.
const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = jwt.verify(token, SECRET, { issuer: 'astra' });
    const r = await query('SELECT id, name, email, role, organisation, is_active FROM users WHERE id=$1', [payload.id]);
    const u = r.rows[0];
    if (!u || !u.is_active) return res.status(401).json({ error: 'Account not found or disabled' });
    req.user = { id: u.id, name: u.name, email: u.email, role: u.role, organisation: u.organisation };
    return next();
  } catch (e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    return next(e);
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
  return next();
};

// Engineers and admins can change things; viewers are read-only.
const canWrite = requireRole('admin', 'engineer');

module.exports = { auth, requireRole, canWrite, sign, adminEmails };
