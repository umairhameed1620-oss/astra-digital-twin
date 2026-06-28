require('dotenv').config();
require('express-async-errors');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const compression = require('compression');

const config = require('./config');
const logger = require('./monitoring/logger');
const { metricsMiddleware, register, activeWebsockets } = require('./monitoring/metrics');
const { helmetMiddleware, globalLimiter, authLimiter, aiLimiter, sanitiseInput, requestLogger, corsOptions, hpp } = require('./security');
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { connectDB } = require('./utils/database');
const { connectRedis } = require('./utils/redis');
const { initSocket } = require('./utils/socketManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions, pingTimeout: 60000, transports: ['websocket', 'polling'] });

// Security
app.set('trust proxy', 1);
app.use(helmetMiddleware);
app.use(cors(corsOptions));
app.use(hpp());
app.use(compression());
app.use(requestLogger);
app.use(metricsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitiseInput);

// Rate limiting
app.use('/api/', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/ai/', aiLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/spacecraft', require('./routes/spacecraft'));
app.use('/api/simulation', require('./routes/simulation'));
app.use('/api/telemetry', require('./routes/telemetry'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/missions', require('./routes/missions'));
app.use('/api/conjunction', require('./routes/conjunction'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/admin', require('./routes/admin'));

// System
app.get('/api/health', (req, res) => res.json({
  status: 'ASTRA Enterprise Online', version: '2.0.0',
  environment: config.env, timestamp: new Date().toISOString(),
  uptime: Math.floor(process.uptime()),
  memory: { used: Math.round(process.memoryUsage().heapUsed/1024/1024)+'MB', total: Math.round(process.memoryUsage().heapTotal/1024/1024)+'MB' },
}));

app.get('/api/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Error handling
app.use(notFoundHandler);
app.use(globalErrorHandler);

// WebSocket
initSocket(io);
io.on('connection', () => activeWebsockets.inc());
io.on('disconnect', () => activeWebsockets.dec());

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`${signal} — graceful shutdown initiated`);
  server.close(() => { logger.info('Server closed'); process.exit(0); });
  setTimeout(() => process.exit(1), 30000);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start
const start = async () => {
  try {
    await connectDB();
    try { await connectRedis(); } catch (e) { logger.warn('Redis unavailable — running without cache'); }
    server.listen(config.port, () => {
      logger.info(`🛸 ASTRA Enterprise v2.0.0 on port ${config.port} [${config.env}]`);
    });
  } catch (err) {
    logger.error('Startup failed', { error: err.message });
    process.exit(1);
  }
};

if (require.main === module) start();
module.exports = { app, server, io };
