// Telegram Bot API client for alerts. The server owns one bot (TELEGRAM_BOT_TOKEN from @BotFather);
// each user links their own chat by opening t.me/<bot>?start=<one-time code>.
const { request } = require('./net');

const token = () => process.env.TELEGRAM_BOT_TOKEN || '';
const configured = () => /^\d+:[A-Za-z0-9_-]{30,}$/.test(token());

const call = async (method, body) => {
  if (!configured()) throw new Error('Telegram is not configured on the server (TELEGRAM_BOT_TOKEN)');
  const base = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org'; // override only for tests
  const res = await request(`${base}/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    timeoutMs: 20000,
  });
  let j = null;
  try { j = await res.json(); } catch (e) { /* non-JSON */ }
  if (!j || !j.ok) {
    const desc = j && j.description ? j.description : `HTTP ${res.status}`;
    throw new Error(`Telegram: ${desc}`);
  }
  return j.result;
};

let me = null;
const botInfo = async () => {
  if (!me) me = await call('getMe');
  return me;
};

const ICON = { critical: '🔴', warning: '🟠', nominal: '🟢' };

const send = (chatId, title, text, severity) => call('sendMessage', {
  chat_id: chatId,
  text: `${ICON[severity] || '🛰️'} ${title}\n\n${text}`.slice(0, 4000),
  disable_web_page_preview: true,
});

// Find a chat that sent "/start <code>" recently. Returns { chatId, name } or null.
const findStart = async (code) => {
  const updates = await call('getUpdates', { timeout: 0, allowed_updates: ['message'] });
  for (let i = updates.length - 1; i >= 0; i--) {
    const m = updates[i].message;
    if (!m || typeof m.text !== 'string') continue;
    const parts = m.text.trim().split(/\s+/);
    if (parts[0].startsWith('/start') && parts[1] === code) {
      const c = m.chat || {};
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.title || (c.username ? `@${c.username}` : 'Telegram chat');
      return { chatId: String(c.id), name: c.username ? `${name} (@${c.username})` : name };
    }
  }
  return null;
};

module.exports = { configured, botInfo, send, findStart };
