// HTTP hardening: security headers, CORS allowlist, rate limits.
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const allowedOrigins = () => (process.env.CORS_ORIGINS || 'http://localhost,http://localhost:80,http://localhost:3000,http://127.0.0.1')
  .split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);

const baseCors = {
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
};

// Same-origin requests through the nginx/Caddy proxy still send an Origin header on POST/PUT;
// allow them when the Origin host matches the Host the request was sent to.
const sameHost = (origin, req) => {
  try {
    const o = new URL(origin);
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
    // nginx forwards $host (no port), so compare hostnames only.
    return !!host && o.hostname.toLowerCase() === host.replace(/:\d+$/, '');
  } catch (e) { return false; }
};

const corsDelegate = (req, cb) => {
  const origin = req.headers.origin;
  if (!origin || sameHost(origin, req) || allowedOrigins().includes(origin.replace(/\/$/, ''))) {
    return cb(null, { ...baseCors, origin: true });
  }
  return cb(new Error('CORS_NOT_ALLOWED'));
};

const apply = (app) => {
  app.disable('x-powered-by');
  // Behind nginx / Caddy: trust the first proxy so rate limits see the real client IP.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors(corsDelegate));

  const json = { standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, slow down' } };
  app.use('/api/', rateLimit({ ...json, windowMs: 15 * 60 * 1000, max: Number(process.env.RATE_LIMIT_MAX) || 600 }));
  app.use('/api/auth/login', rateLimit({ ...json, windowMs: 15 * 60 * 1000, max: Number(process.env.RATE_LIMIT_AUTH_MAX) || 20 }));
  app.use('/api/auth/register', rateLimit({ ...json, windowMs: 60 * 60 * 1000, max: 10 }));
  // Two-factor codes: 10 tries per 15 minutes per IP on top of the per-code replay protection.
  app.use('/api/auth/2fa/verify', rateLimit({ ...json, windowMs: 15 * 60 * 1000, max: Number(process.env.RATE_LIMIT_2FA_MAX) || 10 }));
  app.use('/api/team/invitations/lookup', rateLimit({ ...json, windowMs: 15 * 60 * 1000, max: 30 }));
};

module.exports = { apply, allowedOrigins };
