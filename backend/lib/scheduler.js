// Background jobs: catalogue refresh, TLE refresh for NORAD-linked twins, automatic screening
// with alerts for launched/operational twins, and Space-Track CDM polling.
const cron = require('node-cron');
const { query } = require('./db');
const log = require('./log');
const conj = require('../utils/conjunction');
const events = require('./events');
const spacetrack = require('./spacetrack');
const CDM = require('./cdm');
const metrics = require('./metrics');
const T = require('./tle');

const SPACETRACK_EVERY_MS = (Number(process.env.SPACETRACK_POLL_HOURS) || 8) * 3600 * 1000;

let running = false;
let lastSpaceTrack = 0;
const status = { lastTickAt: null, lastScreenings: 0, lastError: null, lastSpaceTrackAt: null, lastSpaceTrackError: null };

const fleetOf = async (userId) => (await query(
  'SELECT id, name, type, config, user_id, norad_id, tle_line1, tle_line2 FROM spacecraft WHERE user_id=$1 AND is_deleted=false', [userId]
)).rows;

// Update CelesTrak-linked twins from the freshly loaded catalogue (no extra network requests).
const refreshTles = async () => {
  const rows = (await query("SELECT id, norad_id, tle_epoch FROM spacecraft WHERE is_deleted=false AND tle_source='celestrak' AND norad_id IS NOT NULL")).rows;
  let updated = 0;
  for (const r of rows) {
    const t = conj.findInCatalog(r.norad_id);
    if (!t) continue;
    try {
      const v = T.validate(t.l1, t.l2);
      if (r.tle_epoch && v.epoch.getTime() <= new Date(r.tle_epoch).getTime()) continue;
      await query('UPDATE spacecraft SET tle_line1=$1, tle_line2=$2, tle_epoch=$3, tle_updated_at=NOW() WHERE id=$4', [v.l1, v.l2, v.epoch, r.id]);
      updated++;
    } catch (e) { /* keep previous TLE */ }
  }
  if (updated) log.info('Refreshed TLEs from catalogue', { updated });
};

const screenDue = async () => {
  const due = (await query(
    `SELECT s.*, COALESCE(a.screening_interval_hours, 6) AS interval_h
       FROM spacecraft s LEFT JOIN alert_settings a ON a.user_id = s.user_id
      WHERE s.is_deleted=false AND s.status IN ('launched','operational')
        AND s.type IN ('satellite','station')
        AND (s.last_screened_at IS NULL OR s.last_screened_at < NOW() - make_interval(hours => COALESCE(a.screening_interval_hours, 6)))
      ORDER BY s.last_screened_at NULLS FIRST LIMIT 20`
  )).rows;
  let n = 0;
  for (const sc of due) {
    try {
      const fleet = await fleetOf(sc.user_id);
      const res = await conj.screenDetailed(sc, fleet, { force: true });
      metrics.screenings.inc({ trigger: 'scheduled' });
      const escalated = await events.persistScreening(sc, res.events);
      await events.alertFor(sc, escalated);
      n++;
    } catch (e) {
      log.warn('Scheduled screening failed', { spacecraft: sc.id, error: e.message });
      await query('UPDATE spacecraft SET last_screened_at=NOW() WHERE id=$1', [sc.id]); // back off until next interval
    }
  }
  return n;
};

const pollSpaceTrack = async () => {
  if (!spacetrack.configured() || Date.now() - lastSpaceTrack < SPACETRACK_EVERY_MS) return;
  lastSpaceTrack = Date.now();
  const twins = (await query(
    "SELECT * FROM spacecraft WHERE is_deleted=false AND norad_id IS NOT NULL AND status IN ('launched','operational')"
  )).rows;
  if (!twins.length) return;
  try {
    const rows = await spacetrack.upcomingCdms(twins.map((t) => t.norad_id));
    const cdms = rows.map((r) => CDM.parse(JSON.stringify(r))[0]);
    for (const sc of twins) {
      const mine = cdms.filter((c) => c.obj.some((o) => String(Number(o.designator)) === String(sc.norad_id)));
      if (mine.length) await events.ingestCdms(sc, mine, 'spacetrack');
    }
    status.lastSpaceTrackAt = new Date().toISOString();
    status.lastSpaceTrackError = null;
  } catch (e) {
    status.lastSpaceTrackError = e.message;
    log.warn('Space-Track poll failed', { error: e.message });
  }
};

const tick = async () => {
  if (running) return;
  running = true;
  try {
    await conj.loadCatalog();
    await refreshTles();
    status.lastScreenings = await screenDue();
    await pollSpaceTrack();
    status.lastError = null;
  } catch (e) {
    status.lastError = e.message;
    log.warn('Scheduler tick failed', { error: e.message });
  } finally {
    status.lastTickAt = new Date().toISOString();
    running = false;
  }
};

const start = () => {
  if (process.env.SCHEDULER_ENABLED === 'false') {
    log.info('Scheduler disabled (SCHEDULER_ENABLED=false)');
    return;
  }
  cron.schedule('*/15 * * * *', tick);
  setTimeout(tick, 20000); // first run shortly after startup
  log.info('Scheduler started', { checkEveryMin: 15, spaceTrackEveryHours: SPACETRACK_EVERY_MS / 3600000, spaceTrack: spacetrack.configured() });
};

module.exports = { start, tick, status, refreshTles, fleetOf };
