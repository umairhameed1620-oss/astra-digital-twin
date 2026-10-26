// Prometheus metrics (scraped by the bundled Prometheus at backend:5001/api/metrics).
const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'astra_' });

const httpDuration = new client.Histogram({
  name: 'astra_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.3, 1, 3, 10, 30, 90],
  registers: [register],
});
const screenings = new client.Counter({ name: 'astra_screenings_total', help: 'Conjunction screenings run', labelNames: ['trigger'], registers: [register] });
const alertsSent = new client.Counter({ name: 'astra_alerts_total', help: 'Alerts delivered', labelNames: ['channel', 'status'], registers: [register] });

const middleware = (req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    end({ method: req.method, route, status: res.statusCode });
  });
  next();
};

// Only reachable from inside the Docker network: proxied requests carry X-Forwarded-For.
const handler = async (req, res) => {
  const token = process.env.METRICS_TOKEN;
  const authorised = token ? req.headers.authorization === `Bearer ${token}` : !req.headers['x-forwarded-for'];
  if (!authorised) return res.status(404).json({ error: 'Not found' });
  res.set('Content-Type', register.contentType);
  return res.send(await register.metrics());
};

module.exports = { middleware, handler, screenings, alertsSent };
