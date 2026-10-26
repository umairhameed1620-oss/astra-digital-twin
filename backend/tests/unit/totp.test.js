// Two-factor login: RFC 6238 test vectors, drift window, replay protection, encryption, recovery codes.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-unit-test-secret-1234';
const TOTP = require('../../lib/totp');

const RFC = TOTP.base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  test('RFC 6238 SHA-1 vectors (last 6 digits)', () => {
    expect(TOTP.totp(RFC, 59 * 1000)).toBe('287082');
    expect(TOTP.totp(RFC, 1111111109 * 1000)).toBe('081804');
    expect(TOTP.totp(RFC, 1234567890 * 1000)).toBe('005924');
    expect(TOTP.totp(RFC, 2000000000 * 1000)).toBe('279037');
  });

  test('accepts one step of clock drift, not two', () => {
    const now = 1_800_000_000_000;
    const s = TOTP.generateSecret();
    expect(TOTP.verify(s, TOTP.totp(s, now - 30000), { ms: now })).not.toBeNull();
    expect(TOTP.verify(s, TOTP.totp(s, now + 30000), { ms: now })).not.toBeNull();
    expect(TOTP.verify(s, TOTP.totp(s, now - 90000), { ms: now })).toBeNull();
  });

  test('a code cannot be used twice', () => {
    const now = 1_800_000_000_000;
    const s = TOTP.generateSecret();
    const code = TOTP.totp(s, now);
    const step = TOTP.verify(s, code, { ms: now });
    expect(step).not.toBeNull();
    expect(TOTP.verify(s, code, { ms: now, lastStep: step })).toBeNull();
  });

  test('rejects malformed codes', () => {
    const s = TOTP.generateSecret();
    expect(TOTP.verify(s, '12345')).toBeNull();
    expect(TOTP.verify(s, 'abcdef')).toBeNull();
  });

  test('secrets are encrypted at rest and tamper-evident', () => {
    const s = TOTP.generateSecret();
    const enc = TOTP.encrypt(s);
    expect(enc).not.toContain(s);
    expect(TOTP.decrypt(enc)).toBe(s);
    const parts = enc.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => TOTP.decrypt(parts.join(':'))).toThrow();
  });

  test('recovery codes are unique and hashed case-insensitively', () => {
    const codes = TOTP.newRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(TOTP.hashCode(codes[0].toUpperCase())).toBe(TOTP.hashCode(codes[0]));
    expect(TOTP.hashCode(codes[0].replace(/-/g, ''))).toBe(TOTP.hashCode(codes[0]));
  });

  test('otpauth URL carries issuer and account', () => {
    expect(TOTP.otpauthUrl('ABC', 'a@b.c')).toBe('otpauth://totp/ASTRA:a%40b.c?secret=ABC&issuer=ASTRA&algorithm=SHA1&digits=6&period=30');
  });
});
