require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { Server } = require('socket.io');
const { SimulationEngine } = require('./utils/simulationEngine');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'astra_secret_2024';
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const activeSimulations = new Map();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};

app.use('/api/auth', require('./routes/auth'));
app.get('/api/spacecraft', auth, async (req, res) => { try { const r = await pool.query('SELECT * FROM spacecraft WHERE user_id=$1 AND is_deleted=false ORDER BY created_at DESC', [req.user.id]); res.json({ data: r.rows, pagination: { total: r.rows.length, page: 1, limit: 20, totalPages: 1 } }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/api/spacecraft', auth, async (req, res) => { try { const { name, type, description, components, config } = req.body; const id = uuidv4(); const r = await pool.query('INSERT INTO spacecraft (id,user_id,name,type,description,components,config,status,is_deleted,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *', [id, req.user.id, name, type, description, JSON.stringify(components||[]), JSON.stringify(config||{}), 'designed', false]); res.status(201).json(r.rows[0]); } catch(e) { res.status(500).json({ error: e.message }); } });
app.get('/api/spacecraft/:id', auth, async (req, res) => { try { const r = await pool.query('SELECT * FROM spacecraft WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); res.json(r.rows[0]); } catch(e) { res.status(500).json({ error: e.message }); } });
app.put('/api/spacecraft/:id', auth, async (req, res) => { try { const { name, type, description, components, config, status } = req.body; const r = await pool.query('UPDATE spacecraft SET name=$1,type=$2,description=$3,components=$4,config=$5,status=$6,updated_at=NOW() WHERE id=$7 AND user_id=$8 RETURNING *', [name, type, description, JSON.stringify(components||[]), JSON.stringify(config||{}), status||'designed', req.params.id, req.user.id]); res.json(r.rows[0]); } catch(e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/spacecraft/:id', auth, async (req, res) => { try { await pool.query('UPDATE spacecraft SET is_deleted=true WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); res.json({ message: 'Deleted', id: req.params.id }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.get('/api/missions', auth, async (req, res) => { try { const r = await pool.query('SELECT m.*,s.name as spacecraft_name FROM missions m LEFT JOIN spacecraft s ON m.spacecraft_id=s.id WHERE m.user_id=$1 ORDER BY m.created_at DESC', [req.user.id]); res.json({ data: r.rows, pagination: { total: r.rows.length, page: 1, limit: 20, totalPages: 1 } }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/api/missions', auth, async (req, res) => { try { const { name, spacecraftId, description, objectives, timeline } = req.body; const id = uuidv4(); const r = await pool.query('INSERT INTO missions (id,user_id,spacecraft_id,name,description,objectives,timeline,status,is_deleted,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *', [id, req.user.id, spacecraftId||null, name, description, JSON.stringify(objectives||[]), JSON.stringify(timeline||[]), 'planning', false]); res.status(201).json(r.rows[0]); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/api/simulation/start/:id', auth, async (req, res) => { try { const sc = await pool.query('SELECT * FROM spacecraft WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); if (!sc.rows.length) return res.status(404).json({ error: 'Not found' }); await pool.query('UPDATE spacecraft SET status=$1 WHERE id=$2', ['simulating', req.params.id]); res.json({ message: 'Simulation started', spacecraftId: req.params.id, config: sc.rows[0].config || {} }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/api/simulation/stop/:id', auth, async (req, res) => { try { await pool.query('UPDATE spacecraft SET status=$1 WHERE id=$2 AND user_id=$3', ['designed', req.params.id, req.user.id]); res.json({ message: 'Simulation stopped' }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.get('/api/telemetry/:id/history', auth, (req, res) => res.json([]));
app.post('/api/telemetry/:id/log', auth, (req, res) => res.json({ message: 'Logged' }));
app.post('/api/ai/analyse', auth, (req, res) => res.json({ response: 'ARIA AI offline. Add ANTHROPIC_API_KEY to enable.', timestamp: new Date().toISOString() }));
app.post('/api/ai/briefing', auth, (req, res) => res.json({ briefing: 'ARIA offline.', timestamp: new Date().toISOString() }));
app.get('/api/conjunction-demo/:id', auth, (req, res) => res.json({ spacecraftId: req.params.id, totalEvents: 2, criticalCount: 0, warningCount: 1, events: [{ id: 'c1', objectName: 'COSMOS 2251 Debris', objectId: 'DEB-001', hoursToTCA: '18.5', missDistance: '0.842', relativeVelocity: '7.23', collisionProbability: '1.2e-4', severity: 'warning', tcaTime: new Date(Date.now()+66600000).toISOString(), recommendation: 'Monitor closely.' }, { id: 'c2', objectName: 'FENGYUN 1C Debris', objectId: 'DEB-042', hoursToTCA: '36.2', missDistance: '3.241', relativeVelocity: '5.87', collisionProbability: '8.4e-6', severity: 'nominal', tcaTime: new Date(Date.now()+130320000).toISOString(), recommendation: 'No action required.' }] }));
app.get('/api/conjunction-demo/:id/manoeuvre', auth, (req, res) => res.json({ currentAltitude: 550, recommendedAltitude: 552, manoeuvre: { type: 'Hohmann Transfer', dv1: '0.82 m/s', dv2: '0.81 m/s', totalDeltaV: '1.63 m/s', transferTime: '48.2 minutes', fuelEstimate: '0.16 kg', executionWindow: 'T-24h before TCA', burnDuration: '0.1 seconds' }, deltaVBudgetRemaining: 500, budgetAfterManoeuvre: '498.4', warning: null }));

// Lifecycle status: designed -> launched -> operational -> decommissioned
app.put('/api/spacecraft/:id/status', auth, async (req, res) => {
  try {
    const LIFECYCLE = ['designed', 'launched', 'operational', 'decommissioned'];
    const status = req.body && req.body.status;
    if (!LIFECYCLE.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use one of: ' + LIFECYCLE.join(', ') });
    }
    const uid = (req.user && (req.user.id || req.user.userId)) || req.userId;
    const cols = 'id,name,type,description,status,config,created_at,updated_at';
    const r = uid
      ? await pool.query('UPDATE spacecraft SET status=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3 AND is_deleted=false RETURNING ' + cols, [status, req.params.id, uid])
      : await pool.query('UPDATE spacecraft SET status=$1, updated_at=NOW() WHERE id=$2 AND is_deleted=false RETURNING ' + cols, [status, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Spacecraft not found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('Status update error:', e.message);
    res.status(500).json({ error: e.message });
  }
});


// ---- Real conjunction screening (CelesTrak GP data + SGP4) ----
const conjunctionEngine = require('./utils/conjunction');
const loadTwinAndFleet = async (req) => {
  const uid = (req.user && (req.user.id || req.user.userId)) || req.userId;
  const r = uid
    ? await pool.query('SELECT id,name,type,config,user_id FROM spacecraft WHERE id=$1 AND user_id=$2 AND is_deleted=false', [req.params.id, uid])
    : await pool.query('SELECT id,name,type,config,user_id FROM spacecraft WHERE id=$1 AND is_deleted=false', [req.params.id]);
  if (!r.rows.length) return null;
  const sc = r.rows[0];
  const f = await pool.query('SELECT id,name,type,config FROM spacecraft WHERE user_id=$1 AND is_deleted=false', [sc.user_id]);
  return { sc, fleet: f.rows };
};
app.get('/api/conjunction/:id/manoeuvre', auth, async (req, res) => {
  try {
    const t = await loadTwinAndFleet(req);
    if (!t) return res.status(404).json({ error: 'Spacecraft not found' });
    const report = await conjunctionEngine.screen(t.sc, t.fleet);
    res.json(conjunctionEngine.planManoeuvre(t.sc, report));
  } catch (e) {
    console.error('Manoeuvre planning error:', e.message);
    res.status(502).json({ error: e.message });
  }
});
app.get('/api/conjunction/:id', auth, async (req, res) => {
  try {
    const t = await loadTwinAndFleet(req);
    if (!t) return res.status(404).json({ error: 'Spacecraft not found' });
    const report = await conjunctionEngine.screen(t.sc, t.fleet);
    res.json(report);
  } catch (e) {
    console.error('Conjunction screening error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/reports/:id', auth, async (req, res) => { try { const r = await pool.query('SELECT * FROM spacecraft WHERE id=$1', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); const s = r.rows[0]; res.setHeader('Content-Type', 'text/html'); res.send('<html><body style="font-family:monospace;background:#020408;color:#00d4ff;padding:40px"><h1>ASTRA Report</h1><h2>'+s.name+'</h2><p>Type: '+s.type+'</p></body></html>'); } catch(e) { res.status(500).json({ error: e.message }); } });
app.get('/api/admin/stats', auth, async (req, res) => { try { const [u,s,m] = await Promise.all([pool.query('SELECT COUNT(*) as total FROM users'), pool.query('SELECT COUNT(*) as total FROM spacecraft WHERE is_deleted=false'), pool.query('SELECT COUNT(*) as total FROM missions')]); res.json({ users: u.rows[0], spacecraft: s.rows[0], missions: m.rows[0], faults: { total: 0, critical: 0 }, ai: { total: 0, tokens: 0 }, telemetry: { total: 0 } }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.get('/api/admin/users', auth, async (req, res) => { try { const r = await pool.query('SELECT id,name,email,organisation,role,is_active,last_login_at,created_at FROM users ORDER BY created_at DESC'); res.json({ data: r.rows, pagination: { total: r.rows.length } }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.patch('/api/admin/users/:id', auth, async (req, res) => { try { const { role, is_active } = req.body; await pool.query('UPDATE users SET role=COALESCE($1,role),is_active=COALESCE($2,is_active) WHERE id=$3', [role, is_active, req.params.id]); res.json({ message: 'Updated' }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.get('/api/admin/audit', auth, (req, res) => res.json({ data: [], pagination: { total: 0 } }));
app.get('/api/health', (req, res) => res.json({ status: 'ASTRA Online', version: '2.0.0' }));
app.use((err, req, res, next) => { res.status(err.statusCode||500).json({ error: err.message||'Server error' }); });

io.on('connection', (socket) => {
  socket.on('start_simulation', ({ spacecraftId, config }) => {
    if (activeSimulations.has(spacecraftId)) activeSimulations.get(spacecraftId).stop();
    const engine = new SimulationEngine(spacecraftId, config || { type: 'satellite', altitude: 550, inclination: 53, deltaV: 500, powerConsumption: 200 });
    activeSimulations.set(spacecraftId, engine);
    engine.start((telemetry) => socket.emit('telemetry_update', telemetry));
    socket.emit('simulation_started', { spacecraftId });
  });
  socket.on('stop_simulation', ({ spacecraftId }) => {
    if (activeSimulations.has(spacecraftId)) { activeSimulations.get(spacecraftId).stop(); activeSimulations.delete(spacecraftId); }
    socket.emit('simulation_stopped', { spacecraftId });
  });
  socket.on('inject_fault', ({ spacecraftId, fault }) => {
    if (activeSimulations.has(spacecraftId)) activeSimulations.get(spacecraftId).injectFault(fault);
    socket.emit('fault_injected', { spacecraftId, fault });
  });
});

server.listen(5001, async () => {
  try { await pool.query('SELECT 1'); console.log('ASTRA running on port 5001'); }
  catch(e) { console.error(e.message); }
});

module.exports = { app };
