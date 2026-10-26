// Authentication: JWT signing/verification, per-request user + organisation lookup, role checks.
//
// Two kinds of role:
//   users.role      platform role: 'admin' runs this ASTRA server (Admin page); everyone else 'engineer'/'viewer'.
//   users.org_role  role inside the user's organisation (team): owner / admin / engineer / viewer.
// All operational data (spacecraft, missions, CDMs, validation) belongs to the organisation.
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
const ISSUER = 'astra';
const CHALLENGE_ISSUER = 'astra-2fa';

const sign = (user) => jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: TOKEN_TTL, issuer: ISSUER });

// Short-lived token proving the password was correct; exchanged for a session after the 2FA code.
const signChallenge = (user) => jwt.sign({ id: user.id, purpose: '2fa' }, SECRET, { expiresIn: '5m', issuer: CHALLENGE_ISSUER });
const verifyChallenge = (token) => {
  const p = jwt.verify(String(token || ''), SECRET, { issuer: CHALLENGE_ISSUER });
  if (p.purpose !== '2fa') throw new Error('Invalid challenge');
  return p;
};

const adminEmails = () => (process.env.ADMIN_EMAILS || '')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

const USER_SQL = `SELECT u.id, u.name, u.email, u.role, u.organisation, u.is_active, u.organisation_id, u.org_role, u.totp_enabled,
                         o.name AS org_name, o.require_2fa
                    FROM users u JOIN organisations o ON o.id = u.organisation_id WHERE u.id=$1`;

const loadUser = async (id) => {
  const u = (await query(USER_SQL, [id])).rows[0];
  if (!u) return null;
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, organisation: u.org_name, isActive: u.is_active,
    orgId: u.organisation_id, orgRole: u.org_role, orgName: u.org_name, totpEnabled: u.totp_enabled,
    mustSetup2fa: !!u.require_2fa && !u.totp_enabled,
  };
};

// Verifies the token and re-reads the user, so role changes, team moves and deactivation take effect immediately.
// When the team requires 2FA and the user has not set it up, only the 2FA setup routes are allowed.
const authenticate = (allowWithout2fa) => async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = jwt.verify(token, SECRET, { issuer: ISSUER });
    const u = await loadUser(payload.id);
    if (!u || !u.isActive) return res.status(401).json({ error: 'Account not found or disabled' });
    req.user = u;
    if (u.mustSetup2fa && !allowWithout2fa) {
      return res.status(403).json({ error: 'Your team requires two-factor login. Set it up under Account to continue.', code: '2fa_setup_required' });
    }
    return next();
  } catch (e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    return next(e);
  }
};
const auth = authenticate(false);
const authAllowSetup = authenticate(true);

// Platform role (server administration).
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
  return next();
};

// Team role.
const requireOrgRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.orgRole)) return res.status(403).json({ error: 'Your team role does not allow this' });
  return next();
};

// Owners, admins and engineers change things; viewers are read-only.
const canWrite = requireOrgRole('owner', 'admin', 'engineer');
const canManageTeam = requireOrgRole('owner', 'admin');

module.exports = {
  auth, authAllowSetup, requireRole, requireOrgRole, canWrite, canManageTeam,
  sign, signChallenge, verifyChallenge, adminEmails, loadUser, SECRET,
};
