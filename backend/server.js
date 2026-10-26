process.env.TZ = 'UTC';
require('dotenv').config();
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const log = require('./lib/log');
const { pool, query } = require('./lib/db');
const security = require('./lib/security');
const migrations = require('./lib/migrations');
const { errorMiddleware } = require('./lib/http');
const scheduler = require('./lib/scheduler');
const metrics = require('./lib/metrics');
const { SimulationEngine } = require('./utils/simulationEngine');

const VERSION = '2.2.0';
const PORT = Number(process.env.PORT) || 5001;

const app = express();
const server = http.createServer(app);

security.apply(app);
app.use(metrics.middleware);
app.use(express.json({ limit: '2mb' }));
app.get('/api/metrics', metrics.handler);

// ---- API ----
app.use('/api/auth', require('./routes/auth'));
app.use('/api/spacecraft', require('./api/spacecraft').router);
app.use('/api/conjunction', require('./api/conjunction'));
app.use('/api/missions', require('./api/missions'));
app.use('/api/alerts', require('./api/alerts'));
app.use('/api/validation', require('./api/validation'));
app.use('/api/admin', require('./api/admin'));
app.use('/api', require('./api/misc'));

app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ASTRA Online', version: VERSION, database: 'ok', scheduler: { lastTickAt: scheduler.status.lastTickAt } });
  } catch (e) {
    res.status(503).json({ status: 'degraded', version: VERSION, database: 'unreachable' });
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorMiddleware);

// ---- Real-time simulation (authenticated sockets, owner-only) ----
const io = new Server(server, {
  cors: { origin: security.allowedOrigins(), methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e5,
});
const activeSimulations = new Map(); // spacecraftId -> { engine, userId }

io.use(async (socket, next) => {
  try {
    const token = (socket.handshake.auth && socket.handshake.auth.token) || socket.handshake.query.token;
    const payload = jwt.verify(String(token || ''), process.env.JWT_SECRET, { issuer: 'astra' });
    const r = await query('SELECT id, is_active FROM users WHERE id=$1', [payload.id]);
    if (!r.rows[0] || !r.rows[0].is_active) return next(new Error('unauthorised'));
    socket.data.userId = payload.id;
    return next();
  } catch (e) {
    return next(new Error('unauthorised'));
  }
});

const owns = async (userId, scId) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(scId))) return null;
  const r = await query('SELECT id, type, config FROM spacecraft WHERE id=$1 AND user_id=$2 AND is_deleted=false', [scId, userId]);
  return r.rows[0] || null;
};

io.on('connection', (socket) => {
  socket.on('start_simulation', async ({ spacecraftId } = {}) => {
    const sc = await owns(socket.data.userId, spacecraftId).catch(() => null);
    if (!sc) return socket.emit('simulation_error', { spacecraftId, error: 'Spacecraft not found' });
    const prev = activeSimulations.get(spacecraftId);
    if (prev) prev.engine.stop();
    const cfg = { type: sc.type, altitude: 550, inclination: 53, deltaV: 500, powerConsumption: 200, ...(sc.config || {}) };
    const engine = new SimulationEngine(spacecraftId, cfg);
    activeSimulations.set(spacecraftId, { engine, userId: socket.data.userId, socketId: socket.id });
    engine.start((telemetry) => socket.emit('telemetry_update', telemetry));
    socket.emit('simulation_started', { spacecraftId });
  });
  socket.on('stop_simulation', ({ spacecraftId } = {}) => {
    const sim = activeSimulations.get(spacecraftId);
    if (sim && sim.userId === socket.data.userId) { sim.engine.stop(); activeSimulations.delete(spacecraftId); }
    socket.emit('simulation_stopped', { spacecraftId });
  });
  socket.on('inject_fault', ({ spacecraftId, fault } = {}) => {
    const sim = activeSimulations.get(spacecraftId);
    if (sim && sim.userId === socket.data.userId && fault && typeof fault === 'object') sim.engine.injectFault(fault);
    socket.emit('fault_injected', { spacecraftId, fault });
  });
  socket.on('disconnect', () => {
    for (const [id, sim] of activeSimulations) {
      if (sim.socketId === socket.id) { sim.engine.stop(); activeSimulations.delete(id); }
    }
  });
});

// ---- Startup / shutdown ----
const start = async () => {
  for (let attempt = 1; ; attempt++) {
    try {
      await migrations.run();
      break;
    } catch (e) {
      if (attempt >= 10) { log.error('Database not ready, giving up', { error: e.message }); process.exit(1); }
      log.warn('Database not ready, retrying', { attempt, error: e.message });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  server.listen(PORT, () => log.info(`ASTRA running on port ${PORT}`, { version: VERSION }));
  scheduler.start();
};

const shutdown = (signal) => {
  log.info('Shutting down', { signal });
  for (const { engine } of activeSimulations.values()) engine.stop();
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) start();

module.exports = { app, server, start };
