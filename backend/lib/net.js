// Outbound HTTP with timeouts and a descriptive User-Agent (CelesTrak and Space-Track ask for one).
const UA = 'ASTRA-DigitalTwin/2.1 (+https://github.com/umairhameed1620-oss/astra-digital-twin)';

const request = async (url, { method = 'GET', headers = {}, body, timeoutMs = 45000 } = {}) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers: { 'User-Agent': UA, ...headers }, body, signal: ctrl.signal, redirect: 'follow' });
    return res;
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? `Request to ${new URL(url).host} timed out` : `Could not reach ${new URL(url).host}: ${e.cause ? e.cause.code || e.cause.message : e.message}`);
  } finally {
    clearTimeout(timer);
  }
};

const getText = async (url, opts) => {
  const res = await request(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.text();
};

const getJson = async (url, opts) => JSON.parse(await getText(url, opts));

module.exports = { request, getText, getJson, UA };
