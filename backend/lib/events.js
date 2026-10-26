// Persistence of conjunction events and CDMs, and the alert decision (new or escalated risk).
const { query } = require('./db');
const CDM = require('./cdm');
const notify = require('./notify');
const conj = require('../utils/conjunction');

const RANK = { nominal: 0, warning: 1, critical: 2 };
const bucket = (ms) => Math.round(ms / 600000); // 10-minute TCA bucket for de-duplication

const getSettings = async (userId) => {
  const r = await query('SELECT * FROM alert_settings WHERE user_id=$1', [userId]);
  return r.rows[0] || null;
};

const fmtEvent = (sc, e) => {
  const tca = new Date(e.tca).toISOString().replace('T', ' ').slice(0, 19);
  return [
    `Spacecraft: ${sc.name}${sc.norad_id ? ` (NORAD ${sc.norad_id})` : ''}`,
    `Object: ${e.objectName} (${e.objectId})`,
    `TCA: ${tca} UTC (${((e.tca - Date.now()) / 3600000).toFixed(1)} h from now)`,
    `Miss distance: ${e.missKm.toFixed(3)} km`,
    `Collision probability: ${Number(e.pc).toExponential(1)} (${e.pcMethod || 'estimated'})`,
    `Severity: ${e.severity.toUpperCase()}`,
    '',
    'Open ASTRA > Conjunction to review the manoeuvre options and download the PDF report.',
  ].join('\n');
};

/**
 * Upsert events of a screening run. Returns events that are new or escalated (for alerting).
 * events: scored events from conjunction.screenDetailed
 */
const persistScreening = async (sc, events) => {
  const escalated = [];
  for (const e of events.slice(0, 100)) {
    const key = `${sc.id}:${e.objectId}:${bucket(e.tca)}`;
    const prev = (await query('SELECT id, max_severity FROM conjunction_events WHERE event_key=$1', [key])).rows[0];
    const maxSev = prev && RANK[prev.max_severity] >= RANK[e.severity] ? prev.max_severity : e.severity;
    const data = {
      relativeVelocity: e.relV, tleAgeDays: e.ageObj, source: e.source,
    };
    const r = await query(
      `INSERT INTO conjunction_events (event_key, spacecraft_id, user_id, object_id, object_name, source, tca, miss_km, rel_speed_kms, pc, pc_method, severity, max_severity, data)
       VALUES ($1,$2,$3,$4,$5,'screening',(to_timestamp($6/1000.0) AT TIME ZONE 'UTC'),$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (event_key) DO UPDATE SET miss_km=EXCLUDED.miss_km, rel_speed_kms=EXCLUDED.rel_speed_kms, pc=EXCLUDED.pc,
         pc_method=EXCLUDED.pc_method, severity=EXCLUDED.severity, max_severity=EXCLUDED.max_severity, tca=EXCLUDED.tca,
         data=EXCLUDED.data, last_seen=NOW()
       RETURNING id`,
      [key, sc.id, sc.user_id, String(e.objectId), e.objectName, e.tca, e.missKm, e.relV, e.pc, e.pcMethod, e.severity, maxSev, JSON.stringify(data)]
    );
    const before = prev ? RANK[prev.max_severity] : 0;
    if (RANK[e.severity] > before) escalated.push({ ...e, eventId: r.rows[0].id });
  }
  await query('UPDATE spacecraft SET last_screened_at=NOW() WHERE id=$1', [sc.id]);
  return escalated;
};

// Everyone in the twin's team gets the alert, each on their own channels and minimum severity.
// One alert per object per run: repeated passes of the same object are summarised in a single message.
const recipients = async (sc) => {
  if (sc.organisation_id) {
    return (await query(
      `SELECT u.id, a.* FROM users u LEFT JOIN alert_settings a ON a.user_id = u.id
        WHERE u.organisation_id=$1 AND u.is_active=true ORDER BY u.created_at`, [sc.organisation_id]
    )).rows.map((r) => ({ userId: r.id, settings: r.user_id ? r : null }));
  }
  return [{ userId: sc.user_id, settings: await getSettings(sc.user_id) }];
};

const alertFor = async (sc, escalated) => {
  if (sc.alerts_muted || !escalated.length) return 0; // twin tracked for validation only, or nothing new
  const groups = new Map();
  for (const e of escalated) {
    const k = String(e.objectId);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  let sent = 0;
  for (const { userId, settings } of await recipients(sc)) {
    const min = RANK[(settings && settings.min_severity) || 'warning'];
    for (const all of groups.values()) {
      const list = all.filter((e) => RANK[e.severity] >= min).sort((a, b) => RANK[b.severity] - RANK[a.severity] || b.pc - a.pc);
      if (!list.length) continue;
      const worst = list[0];
      const more = list.length > 1
        ? `\n\n${list.length} close approaches with this object in the window; earliest TCA ${new Date(Math.min(...list.map((e) => e.tca))).toISOString().replace('T', ' ').slice(0, 16)} UTC.`
        : '';
      const title = `[ASTRA ${worst.severity.toUpperCase()}] ${sc.name} conjunction with ${worst.objectName}${list.length > 1 ? ` (${list.length} passes)` : ''}`;
      await notify.deliver({ userId, scId: sc.id, eventId: worst.eventId, severity: worst.severity, title, message: fmtEvent(sc, worst) + more, settings });
      sent++;
    }
  }
  return sent;
};

/**
 * Store CDMs for a twin, recompute Pc with Foster where covariance is present, persist matching
 * conjunction events and alert on new high-risk CDMs. Returns the stored rows (new ones flagged).
 */
const ingestCdms = async (sc, cdms, source) => {
  const out = [];
  const escalated = [];
  for (const c of cdms) {
    const a = CDM.assess(c, sc.norad_id);
    const pc = a.pc != null ? a.pc : c.pcReported;
    const miss = a.missKm != null ? a.missKm : c.missKm;
    const ins = await query(
      `INSERT INTO cdms (user_id, spacecraft_id, cdm_id, source, tca, object_id, object_name, miss_km, pc_reported, pc_foster, pc_note, parsed)
       VALUES ($1,$2,$3,$4,(to_timestamp($5/1000.0) AT TIME ZONE 'UTC'),$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (spacecraft_id, cdm_id) DO NOTHING RETURNING *`,
      [sc.user_id, sc.id, c.cdmId, source, c.tca, a.other.designator || null, a.other.name || null, miss, c.pcReported, a.pc,
        [a.method, a.note].filter(Boolean).join(' — ') || null,
        JSON.stringify({ created: c.created, emergency: c.emergency, relSpeedKms: c.relSpeedKms, pcMethodReported: c.pcMethodReported })]
    );
    const isNew = ins.rows.length > 0;
    const row = isNew ? ins.rows[0] : (await query('SELECT * FROM cdms WHERE spacecraft_id=$1 AND cdm_id=$2', [sc.id, c.cdmId])).rows[0];
    out.push({ ...row, isNew });
    if (pc == null || miss == null) continue;

    const severity = c.emergency ? 'critical' : conj.classify(pc, miss);
    const objectId = String(a.other.designator || 'UNKNOWN');
    const key = `${sc.id}:cdm:${objectId}:${bucket(c.tca)}`;
    const prev = (await query('SELECT id, max_severity FROM conjunction_events WHERE event_key=$1', [key])).rows[0];
    const maxSev = prev && RANK[prev.max_severity] >= RANK[severity] ? prev.max_severity : severity;
    const ev = await query(
      `INSERT INTO conjunction_events (event_key, spacecraft_id, user_id, object_id, object_name, source, tca, miss_km, rel_speed_kms, pc, pc_method, severity, max_severity, data)
       VALUES ($1,$2,$3,$4,$5,'cdm',(to_timestamp($6/1000.0) AT TIME ZONE 'UTC'),$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (event_key) DO UPDATE SET miss_km=EXCLUDED.miss_km, pc=EXCLUDED.pc, pc_method=EXCLUDED.pc_method,
         severity=EXCLUDED.severity, max_severity=EXCLUDED.max_severity, data=EXCLUDED.data, last_seen=NOW()
       RETURNING id`,
      [key, sc.id, sc.user_id, objectId, a.other.name || objectId, c.tca, miss, c.relSpeedKms, pc,
        a.pc != null ? a.method : `Reported by ${source === 'spacetrack' ? 'Space-Track' : 'CDM issuer'}`,
        severity, maxSev, JSON.stringify({ cdmId: c.cdmId, source })]
    );
    if (RANK[severity] > (prev ? RANK[prev.max_severity] : 0)) {
      escalated.push({
        objectName: a.other.name || objectId, objectId, tca: c.tca, missKm: miss, pc, severity,
        pcMethod: a.pc != null ? a.method : 'reported in CDM', eventId: ev.rows[0].id,
      });
    }
  }
  const alerts = await alertFor(sc, escalated);
  return { rows: out, alerts };
};

module.exports = { persistScreening, alertFor, ingestCdms, getSettings, RANK };
