// Alert settings, history and test delivery.
const express = require('express');
const { z } = require('zod');
const { query } = require('../lib/db');
const { auth, canWrite } = require('../lib/auth');
const { handle, parse, HttpError } = require('../lib/http');
const { audit } = require('../lib/audit');
const notify = require('../lib/notify');
const spacetrack = require('../lib/spacetrack');
const scheduler = require('../lib/scheduler');

const router = express.Router();
router.use(auth);

const DEFAULTS = { email_enabled: false, email_to: null, slack_enabled: false, slack_webhook_url: null, min_severity: 'warning', screening_interval_hours: 6 };

const settingsSchema = z.object({
  email_enabled: z.boolean(),
  email_to: z.string().trim().email().max(200).optional().nullable().or(z.literal('')),
  slack_enabled: z.boolean(),
  slack_webhook_url: z.string().trim().max(500).optional().nullable().or(z.literal('')),
  min_severity: z.enum(['warning', 'critical']),
  screening_interval_hours: z.coerce.number().int().min(1).max(48),
});

const masked = (s) => ({
  ...s,
  slack_webhook_url: s.slack_webhook_url ? `${s.slack_webhook_url.slice(0, 34)}…` : null,
  slack_webhook_set: !!s.slack_webhook_url,
});

const load = async (userId) => (await query('SELECT * FROM alert_settings WHERE user_id=$1', [userId])).rows[0] || { ...DEFAULTS, user_id: userId };

router.get('/settings', handle(async (req, res) => {
  res.json({ ...masked(await load(req.user.id)), emailDefault: req.user.email });
}));

router.put('/settings', canWrite, handle(async (req, res) => {
  const b = parse(settingsSchema, req.body);
  const cur = await load(req.user.id);
  // An unchanged (masked) webhook keeps the stored value.
  let hook = b.slack_webhook_url ? b.slack_webhook_url : null;
  if (hook && hook.endsWith('…')) hook = cur.slack_webhook_url;
  if (b.slack_enabled && !hook) throw new HttpError(400, 'Enter a Slack incoming-webhook URL to enable Slack alerts');
  if (hook && !notify.validSlackUrl(hook)) throw new HttpError(400, 'Slack URL must be an incoming webhook (https://hooks.slack.com/...)');
  if (b.email_enabled && !b.email_to) throw new HttpError(400, 'Enter an email address to enable email alerts');
  const r = await query(
    `INSERT INTO alert_settings (user_id, email_enabled, email_to, slack_enabled, slack_webhook_url, min_severity, screening_interval_hours, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (user_id) DO UPDATE SET email_enabled=$2, email_to=$3, slack_enabled=$4, slack_webhook_url=$5, min_severity=$6,
       screening_interval_hours=$7, updated_at=NOW() RETURNING *`,
    [req.user.id, b.email_enabled, b.email_to || null, b.slack_enabled, hook, b.min_severity, b.screening_interval_hours]
  );
  await audit(req, 'alert_settings_updated', 'user', req.user.id, { email: b.email_enabled, slack: b.slack_enabled, min: b.min_severity });
  res.json(masked(r.rows[0]));
}));

router.post('/test', canWrite, handle(async (req, res) => {
  const settings = await load(req.user.id);
  const results = await notify.deliver({
    userId: req.user.id,
    severity: 'warning',
    title: '[ASTRA TEST] Alert delivery check',
    message: `This is a test alert from ASTRA for ${req.user.name}. If you can read this, conjunction alerts will reach you here.`,
    settings,
  });
  res.json({ results });
}));

router.get('/', handle(async (req, res) => {
  const r = await query(
    `SELECT a.*, s.name AS spacecraft_name FROM alerts a LEFT JOIN spacecraft s ON s.id = a.spacecraft_id
      WHERE a.user_id=$1 ORDER BY a.created_at DESC LIMIT 200`, [req.user.id]
  );
  res.json({ data: r.rows });
}));

router.get('/status', handle(async (req, res) => {
  res.json({
    scheduler: scheduler.status,
    schedulerEnabled: process.env.SCHEDULER_ENABLED !== 'false',
    emailConfigured: notify.smtpConfigured(),
    spaceTrackConfigured: spacetrack.configured(),
  });
}));

module.exports = router;
