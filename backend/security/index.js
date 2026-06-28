const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const xss = require('xss');
const config = require('../config');
const logger = require('../monitoring/logger');

// Helmet - HTTP headers security
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later', retryAfter: Math.ceil(config.rateLimit.windowMs / 1000) },
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json(options.message);
  },
});

// Strict auth rate limiter (brute force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimit.authMax,
  message: { error: 'Too many authentication attempts, account temporarily locked' },
  handler: (req, res, next, options) => {
    logger.warn('Auth rate limit exceeded', { ip: req.ip, email: req.body?.email });
    res.status(429).json(options.message);
  },
});

// AI endpoint limiter
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'AI request limit exceeded, please wait 1 minute' },
});

// XSS sanitisation middleware
const sanitiseInput = (req, res, next) => {
  const sanitise = (obj) => {
    if (typeof obj === 'string') return xss(obj);
    if (Array.isArray(obj)) return obj.map(sanitise);
    if (obj && typeof obj === 'object') {
      return Object.keys(obj).reduce((acc, key) => {
        acc[key] = sanitise(obj[key]);
        return acc;
      }, {});
    }
    return obj;
  };
  if (req.body) req.body = sanitise(req.body);
  if (req.query) req.query = sanitise(req.query);
  next();
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user?.id,
    });
  });
  next();
};

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    const allowed = [config.frontendUrl, 'http://localhost:3000', 'http://localhost:3001'];
    if (!origin || allowed.includes(origin)) return callback(null, true);
    logger.warn('CORS blocked request', { origin });
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
};

module.exports = { helmetMiddleware, globalLimiter, authLimiter, aiLimiter, sanitiseInput, requestLogger, corsOptions, hpp };
