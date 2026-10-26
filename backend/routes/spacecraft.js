const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query, queryPaginated, withTransaction, auditLog } = require('../utils/database');
const { cache } = require('../utils/redis');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../security/rbac');
const { validate } = require('../validation/validate');
const { spacecraftSchema, spacecraftUpdateSchema, paginationSchema } = require('../validation/schemas');
const { NotFoundError } = require('../middleware/errorHandler');
const config = require('../config');
const router = express.Router();

// Mission lifecycle a twin can move through
const LIFECYCLE = ['designed', 'launched', 'operational', 'decommissioned'];

router.use(authenticate);

router.get('/', requirePermission('spacecraft:read'), validate(paginationSchema, 'query'), async (req, res) => {
  const { page, limit, sortBy = 'created_at', sortOrder, search } = req.query;
  const cacheKey = `spacecraft:user:${req.user.id}:p${page}:l${limit}:s${search || ''}`;
  const cached = await cache.get(cacheKey);
  if (cached) return res.set('X-Cache', 'HIT').json(cached);

  let baseQuery = 'SELECT id,name,type,description,status,config,created_at,updated_at FROM spacecraft WHERE user_id = $1 AND is_deleted = false';
  const params = [req.user.id];
  if (search) { baseQuery += ` AND name ILIKE $${params.length + 1}`; params.push(`%${search}%`); }
  baseQuery += ` ORDER BY ${['created_at','name','type','status'].includes(sortBy) ? sortBy : 'created_at'} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;

  const result = await queryPaginated(baseQuery, params, { page, limit });
  res.set('X-Total-Count', result.pagination.total);
  await cache.set(cacheKey, result, 60);
  res.json(result);
});

router.post('/', requirePermission('spacecraft:create'), validate(spacecraftSchema), async (req, res) => {
  const countResult = await query('SELECT COUNT(*) FROM spacecraft WHERE user_id=$1 AND is_deleted=false', [req.user.id]);
  if (parseInt(countResult.rows[0].count) >= config.spacecraft.maxPerUser) {
    return res.status(429).json({ error: `Maximum ${config.spacecraft.maxPerUser} spacecraft per account` });
  }

  const { name, type, description, components, config: scConfig } = req.body;
  const id = uuidv4();

  const result = await query(
    'INSERT INTO spacecraft (id,user_id,name,type,description,components,config,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *',
    [id, req.user.id, name, type, description, JSON.stringify(components), JSON.stringify(scConfig), 'designed']
  );

  await cache.delPattern(`spacecraft:user:${req.user.id}:*`);
  await auditLog(req.user.id, 'spacecraft_created', 'spacecraft', id, { name, type, ip: req.ip });
  res.status(201).json(result.rows[0]);
});

router.get('/:id', requirePermission('spacecraft:read'), async (req, res) => {
  const cacheKey = `spacecraft:${req.params.id}`;
  const cached = await cache.get(cacheKey);
  if (cached) return res.set('X-Cache', 'HIT').json(cached);

  const result = await query('SELECT * FROM spacecraft WHERE id=$1 AND user_id=$2 AND is_deleted=false', [req.params.id, req.user.id]);
  if (result.rows.length === 0) throw new NotFoundError('Spacecraft');

  await cache.set(cacheKey, result.rows[0], 300);
  res.json(result.rows[0]);
});

// Change lifecycle status only (designed -> launched -> operational -> decommissioned)
router.put('/:id/status', requirePermission('spacecraft:update'), async (req, res) => {
  const status = req.body && req.body.status;
  if (!LIFECYCLE.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Use one of: ${LIFECYCLE.join(', ')}` });
  }

  const result = await query(
    'UPDATE spacecraft SET status=$1,updated_at=NOW() WHERE id=$2 AND user_id=$3 AND is_deleted=false RETURNING id,name,type,description,status,config,created_at,updated_at',
    [status, req.params.id, req.user.id]
  );
  if (result.rows.length === 0) throw new NotFoundError('Spacecraft');

  await cache.del(`spacecraft:${req.params.id}`);
  await cache.delPattern(`spacecraft:user:${req.user.id}:*`);
  await auditLog(req.user.id, 'spacecraft_status_changed', 'spacecraft', req.params.id, { status, ip: req.ip });
  res.json(result.rows[0]);
});

router.put('/:id', requirePermission('spacecraft:update'), validate(spacecraftUpdateSchema), async (req, res) => {
  const sc = await query('SELECT id FROM spacecraft WHERE id=$1 AND user_id=$2 AND is_deleted=false', [req.params.id, req.user.id]);
  if (sc.rows.length === 0) throw new NotFoundError('Spacecraft');

  const { name, description, components, config: scConfig, status } = req.body;
  const result = await query(
    'UPDATE spacecraft SET name=$1,description=$2,components=$3,config=$4,status=$5,updated_at=NOW() WHERE id=$6 AND user_id=$7 RETURNING *',
    [name, description, JSON.stringify(components), JSON.stringify(scConfig), status, req.params.id, req.user.id]
  );

  await cache.del(`spacecraft:${req.params.id}`);
  await cache.delPattern(`spacecraft:user:${req.user.id}:*`);
  await auditLog(req.user.id, 'spacecraft_updated', 'spacecraft', req.params.id, { ip: req.ip });
  res.json(result.rows[0]);
});

// Soft delete
router.delete('/:id', requirePermission('spacecraft:delete'), async (req, res) => {
  const sc = await query('SELECT id FROM spacecraft WHERE id=$1 AND user_id=$2 AND is_deleted=false', [req.params.id, req.user.id]);
  if (sc.rows.length === 0) throw new NotFoundError('Spacecraft');

  await withTransaction(async (client) => {
    await client.query('UPDATE spacecraft SET is_deleted=true,deleted_at=NOW(),status=$1 WHERE id=$2', ['archived', req.params.id]);
    await client.query('UPDATE missions SET spacecraft_id=NULL WHERE spacecraft_id=$1', [req.params.id]);
  });

  await cache.del(`spacecraft:${req.params.id}`);
  await cache.delPattern(`spacecraft:user:${req.user.id}:*`);
  await auditLog(req.user.id, 'spacecraft_deleted', 'spacecraft', req.params.id, { ip: req.ip });
  res.json({ message: 'Spacecraft deleted', id: req.params.id });
});

module.exports = router;
