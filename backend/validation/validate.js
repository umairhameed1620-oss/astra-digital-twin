const logger = require('../monitoring/logger');

const validate = (schema, source = 'body') => (req, res, next) => {
  const data = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));
    logger.warn('Validation failed', { path: req.path, errors });
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }
  if (source === 'body') req.body = result.data;
  else if (source === 'query') req.query = result.data;
  next();
};

module.exports = { validate };
