// Alert delivery: email (SMTP) and Slack incoming webhooks. Every attempt is recorded in `alerts`.
const nodemailer = require('nodemailer');
const { request } = require('./net');
const { query } = require('./db');
const log = require('./log');

const SLACK_RE = /^https:\/\/hooks\.slack\.com\/(services|workflows|triggers)\/[A-Za-z0-9/_-]+$/;
const validSlackUrl = (u) => SLACK_RE.test(String(u || ''));

const smtpConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
let transport = null;
const mailer = () => {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
};

const metrics = require('./metrics');

const record = (userId, scId, eventId, channel, severity, title, message, status, error) => (metrics.alertsSent.inc({ channel, status }), query(
  'INSERT INTO alerts (user_id, spacecraft_id, event_id, channel, severity, title, message, status, error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
  [userId, scId || null, eventId || null, channel, severity, title.slice(0, 300), message, status, error ? String(error).slice(0, 500) : null]
));

const sendEmail = async (to, subject, text) => {
  if (!smtpConfigured()) throw new Error('SMTP is not configured on the server (SMTP_HOST / SMTP_FROM)');
  await mailer().sendMail({ from: process.env.SMTP_FROM, to, subject, text });
};

const sendSlack = async (url, title, text, severity) => {
  if (!validSlackUrl(url)) throw new Error('Not a Slack incoming-webhook URL');
  const colour = severity === 'critical' ? '#ff4444' : severity === 'warning' ? '#ffaa00' : '#00d4ff';
  const res = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: title, attachments: [{ color: colour, text }] }),
    timeoutMs: 15000,
  });
  if (!res.ok) throw new Error(`Slack returned HTTP ${res.status}`);
};

/**
 * Deliver one alert on every enabled channel. Always records an in-app alert.
 * settings: row from alert_settings (may be null).
 */
const deliver = async ({ userId, scId, eventId, severity, title, message, settings }) => {
  const results = [];
  await record(userId, scId, eventId, 'inapp', severity, title, message, 'sent');
  results.push({ channel: 'inapp', status: 'sent' });
  if (settings && settings.email_enabled && settings.email_to) {
    try {
      await sendEmail(settings.email_to, title, message);
      await record(userId, scId, eventId, 'email', severity, title, message, 'sent');
      results.push({ channel: 'email', status: 'sent' });
    } catch (e) {
      log.warn('Email alert failed', { error: e.message });
      await record(userId, scId, eventId, 'email', severity, title, message, 'failed', e.message);
      results.push({ channel: 'email', status: 'failed', error: e.message });
    }
  }
  if (settings && settings.slack_enabled && settings.slack_webhook_url) {
    try {
      await sendSlack(settings.slack_webhook_url, title, message, severity);
      await record(userId, scId, eventId, 'slack', severity, title, message, 'sent');
      results.push({ channel: 'slack', status: 'sent' });
    } catch (e) {
      log.warn('Slack alert failed', { error: e.message });
      await record(userId, scId, eventId, 'slack', severity, title, message, 'failed', e.message);
      results.push({ channel: 'slack', status: 'failed', error: e.message });
    }
  }
  return results;
};

module.exports = { deliver, validSlackUrl, smtpConfigured };
