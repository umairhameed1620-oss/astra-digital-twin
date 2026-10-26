// Append-only audit trail (table audit_logs from migration 001).
const { query } = require('./db');
const log = require('./log');

const audit = async (req, action, resourceType, resourceId, details = {}) => {
  try {
    const ip = (req && (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || (req && req.ip) || null;
    await query(
      'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address) VALUES ($1,$2,$3,$4,$5,$6)',
      [req && req.user ? req.user.id : null, action, resourceType, resourceId ? String(resourceId) : null, JSON.stringify(details),
        ip && /^[0-9a-f.:]+$/i.test(ip) ? ip.replace(/^::ffff:/, '') : null]
    );
  } catch (e) {
    log.warn('Audit write failed', { action, error: e.message });
  }
};

module.exports = { audit };
