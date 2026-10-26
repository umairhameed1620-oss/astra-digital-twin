// Minimal structured logger (JSON lines in production, readable text in development).
const prod = process.env.NODE_ENV === 'production';

const write = (level, msg, meta) => {
  if (prod) {
    process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(meta || {}) })}\n`);
  } else {
    const extra = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    (level === 'error' ? console.error : console.log)(`[${level}] ${msg}${extra}`);
  }
};

module.exports = {
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};
