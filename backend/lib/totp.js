// Time-based one-time passwords (RFC 6238, HMAC-SHA1, 6 digits, 30 s) compatible with Google Authenticator,
// Microsoft Authenticator, 1Password, Authy etc. Secrets are encrypted at rest with AES-256-GCM.
const crypto = require('crypto');

const STEP = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (buf) => {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
};

const base32Decode = (str) => {
  const s = String(str).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0; let value = 0; const out = [];
  for (const ch of s) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
};

const generateSecret = () => base32Encode(crypto.randomBytes(20)); // 160-bit, as RFC 4226 recommends

const hotp = (secret, counter) => {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
};

const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);
const totp = (secret, ms = Date.now()) => hotp(secret, stepAt(ms));

/**
 * Check a code, allowing one step of clock drift either way.
 * Returns the matched time step (to store for replay protection) or null.
 * A step <= lastStep is rejected, so a code cannot be used twice.
 */
const verify = (secret, code, { lastStep = null, ms = Date.now(), window = 1 } = {}) => {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const now = stepAt(ms);
  for (let d = -window; d <= window; d++) {
    const s = now + d;
    if (lastStep != null && s <= Number(lastStep)) continue;
    const expected = hotp(secret, s);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return s;
  }
  return null;
};

const otpauthUrl = (secret, account, issuer = 'ASTRA') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;

// ---- encryption at rest ----
const key = () => crypto.createHash('sha256')
  .update(process.env.TOTP_ENCRYPTION_KEY || `${process.env.JWT_SECRET || ''}:astra-totp`).digest();

const encrypt = (plain) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
};

const decrypt = (blob) => {
  const [v, iv, tag, data] = String(blob || '').split(':');
  if (v !== 'v1') throw new Error('Unknown secret format');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
};

// ---- recovery codes (single use, stored as SHA-256 hashes) ----
const hashCode = (c) => crypto.createHash('sha256').update(String(c).toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex');
const newRecoveryCodes = (n = 10) => Array.from({ length: n }, () => {
  const raw = crypto.randomBytes(6).toString('hex'); // 12 hex chars
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
});

module.exports = {
  generateSecret, totp, hotp, verify, stepAt, otpauthUrl, encrypt, decrypt, hashCode, newRecoveryCodes, base32Encode, base32Decode,
};
