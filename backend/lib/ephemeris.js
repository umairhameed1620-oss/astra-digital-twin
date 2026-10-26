// Operator ephemerides (CCSDS OEM) stored per spacecraft; attaches the active one to spacecraft rows.
const { query } = require('./db');

const cache = new Map(); // ephemeris id -> states (immutable once stored)
const MAX_CACHE = 50;

const load = async (id) => {
  if (cache.has(id)) return cache.get(id);
  const r = (await query('SELECT id, states, covariance, start_time, stop_time, points, source_frame FROM ephemerides WHERE id=$1', [id])).rows[0];
  if (!r) return null;
  const e = {
    id: r.id, t: r.states.t, r: r.states.r, v: r.states.v, cov: r.covariance || [],
    start: r.start_time, stop: r.stop_time, points: r.points, sourceFrame: r.source_frame,
  };
  cache.set(id, e);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return e;
};

/** Latest active ephemeris per spacecraft that has not ended more than a day ago. */
const activeFor = async (ids) => {
  if (!ids.length) return new Map();
  const r = await query(
    `SELECT DISTINCT ON (spacecraft_id) spacecraft_id, id FROM ephemerides
      WHERE spacecraft_id = ANY($1::uuid[]) AND is_active AND stop_time > NOW() - INTERVAL '1 day'
      ORDER BY spacecraft_id, created_at DESC`, [ids]
  );
  return new Map(r.rows.map((x) => [String(x.spacecraft_id), x.id]));
};

/** Mutates and returns the rows, adding `.ephemeris` where one is active. */
const attach = async (rows) => {
  const list = rows.filter((x) => x && x.id && /^[0-9a-f-]{36}$/i.test(String(x.id)));
  const active = await activeFor(list.map((x) => String(x.id)));
  for (const row of list) {
    const id = active.get(String(row.id));
    row.ephemeris = id ? await load(id) : null;
  }
  return rows;
};

module.exports = { attach, load, activeFor };
