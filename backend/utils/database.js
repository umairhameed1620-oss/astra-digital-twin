const { Pool } = require('pg');
const config = require('../config');
const logger = require('../monitoring/logger');

const pool = new Pool({
  connectionString: config.db.url,
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  min: config.db.poolMin,
  max: config.db.poolMax,
  idleTimeoutMillis: config.db.idleTimeout,
  connectionTimeoutMillis: config.db.connectionTimeout,
  ssl: config.env === 'production' ? { rejectUnauthorized: true } : false,
});

pool.on('error', (err, client) => {
  logger.error('PostgreSQL pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New PostgreSQL client connected');
});

const connectDB = async () => {
  const client = await pool.connect();
  const result = await client.query('SELECT version()');
  logger.info('PostgreSQL connected', { version: result.rows[0].version.split(' ').slice(0, 2).join(' ') });
  client.release();
  return pool;
};

// Standard query
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) logger.warn('Slow query detected', { duration: `${duration}ms`, query: text.substring(0, 100) });
    return result;
  } catch (err) {
    logger.error('Database query error', { error: err.message, query: text.substring(0, 100) });
    throw err;
  }
};

// Transaction helper
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back', { error: err.message });
    throw err;
  } finally {
    client.release();
  }
};

// Paginated query helper
const queryPaginated = async (baseQuery, params, { page = 1, limit = 20 }) => {
  const offset = (page - 1) * limit;
  const countResult = await query(`SELECT COUNT(*) FROM (${baseQuery}) AS count_query`, params);
  const total = parseInt(countResult.rows[0].count);
  const dataResult = await query(`${baseQuery} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
  return {
    data: dataResult.rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  };
};

// Audit log helper
const auditLog = async (userId, action, resourceType, resourceId, details = {}) => {
  try {
    await query(
      'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())',
      [userId, action, resourceType, resourceId, JSON.stringify(details), details.ip || null]
    );
  } catch (err) {
    logger.error('Audit log failed', { error: err.message, action, userId });
  }
};

module.exports = { connectDB, query, withTransaction, queryPaginated, auditLog, pool };
