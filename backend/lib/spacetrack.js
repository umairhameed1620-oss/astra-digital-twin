// Space-Track.org client for public Conjunction Data Messages (class cdm_public).
// Credentials come from SPACETRACK_USER / SPACETRACK_PASSWORD (free account at space-track.org).
// Space-Track rate limits: < 30 requests/minute and < 300/hour; ASTRA polls at most every few hours.
const { request } = require('./net');

const BASE = 'https://www.space-track.org';

const configured = () => !!(process.env.SPACETRACK_USER && process.env.SPACETRACK_PASSWORD);

let session = null; // { cookie, at }

const login = async () => {
  if (session && Date.now() - session.at < 90 * 60 * 1000) return session.cookie;
  const body = new URLSearchParams({ identity: process.env.SPACETRACK_USER, password: process.env.SPACETRACK_PASSWORD });
  const res = await request(`${BASE}/ajaxauth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  const cookie = raw.map((c) => c.split(';')[0]).join('; ');
  if (!res.ok || !cookie || /Failed/i.test(text)) throw new Error('Space-Track login failed. Check SPACETRACK_USER / SPACETRACK_PASSWORD.');
  session = { cookie, at: Date.now() };
  return cookie;
};

const get = async (path) => {
  const cookie = await login();
  const res = await request(`${BASE}${path}`, { headers: { Cookie: cookie } });
  if (res.status === 401) { session = null; throw new Error('Space-Track session expired'); }
  if (!res.ok) throw new Error(`Space-Track HTTP ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { throw new Error('Space-Track returned an unexpected response'); }
};

/** Upcoming public CDMs where any of `noradIds` is the primary or secondary object. */
const upcomingCdms = async (noradIds) => {
  const ids = [...new Set(noradIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return [];
  const rows = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50).join(',');
    for (const side of ['SAT_1_ID', 'SAT_2_ID']) {
      const r = await get(`/basicspacedata/query/class/cdm_public/${side}/${chunk}/TCA/%3Enow/orderby/TCA%20asc/limit/500/format/json`);
      if (Array.isArray(r)) rows.push(...r);
    }
  }
  const seen = new Set();
  return rows.filter((r) => { const k = String(r.CDM_ID); if (seen.has(k)) return false; seen.add(k); return true; });
};

module.exports = { configured, upcomingCdms };
