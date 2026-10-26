// Helpers for consistent API errors. Internal error details are logged, never sent to clients.
const log = require('./log');

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Wrap an async route handler so thrown errors reach the error middleware.
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const errorMiddleware = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err && err.message === 'CORS_NOT_ALLOWED') return res.status(403).json({ error: 'Origin not allowed' });
  log.error('Unhandled error', { path: req.path, method: req.method, error: err && err.message, stack: err && err.stack });
  return res.status(500).json({ error: 'Internal server error' });
};

// Validate a body/query with a zod schema, throwing a 400 with field details.
const parse = (schema, value) => {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = issues[0];
    throw new HttpError(400, first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : 'Invalid request', issues);
  }
  return r.data;
};

module.exports = { HttpError, handle, errorMiddleware, parse };
