const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'astra_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

const httpRequestTotal = new client.Counter({
  name: 'astra_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const activeSimulations = new client.Gauge({
  name: 'astra_active_simulations',
  help: 'Number of active spacecraft simulations',
  registers: [register],
});

const activeWebsockets = new client.Gauge({
  name: 'astra_active_websockets',
  help: 'Active WebSocket connections',
  registers: [register],
});

const aiRequestDuration = new client.Histogram({
  name: 'astra_ai_request_duration_seconds',
  help: 'AI request duration in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const route = req.route?.path || req.path || 'unknown';
    const labels = { method: req.method, route, status_code: res.statusCode };
    httpRequestDuration.observe(labels, (Date.now() - start) / 1000);
    httpRequestTotal.inc(labels);
  });
  next();
};

module.exports = { register, metricsMiddleware, activeSimulations, activeWebsockets, aiRequestDuration };
