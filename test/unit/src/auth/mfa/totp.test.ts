import {
  base32Decode,
  base32Encode,
  generateTotp,
  generateTotpSecret,
  verifyTotp,
} from '../../../../../src/auth/mfa/totp';

const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  test('should round-trip Base32', () => {
    const buffer = Buffer.from('12345678901234567890');

    assert.strictEqual(base32Encode(buffer), RFC_SECRET);
    assert.strictEqual(base32Decode(RFC_SECRET).toString(), buffer.toString());
  });

  test('should match the RFC 6238 SHA-1 vectors', () => {
    const vectors: Array<[number, string]> = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
      [20000000000, '353130'],
    ];

    for (const [seconds, expected] of vectors) {
      assert.strictEqual(generateTotp(RFC_SECRET, seconds * 1000), expected);
    }
  });

  test('should accept the current code within the window', () => {
    const timestamp = 1234567890 * 1000;
    const code = generateTotp(RFC_SECRET, timestamp);

    assert.strictEqual(verifyTotp(RFC_SECRET, code, timestamp), true);
    assert.strictEqual(verifyTotp(RFC_SECRET, code, timestamp + 30_000), true);
    assert.strictEqual(verifyTotp(RFC_SECRET, code, timestamp + 60_000), false);
  });

  test('should reject malformed codes', () => {
    assert.strictEqual(verifyTotp(RFC_SECRET, '12345'), false);
    assert.strictEqual(verifyTotp(RFC_SECRET, 'abcdef'), false);
  });

  test('should generate a 20-byte Base32 secret', () => {
    const secret = generateTotpSecret();

    assert.match(secret, /^[A-Z2-7]+$/);
    assert.strictEqual(base32Decode(secret).length, 20);
    assert.notStrictEqual(secret, generateTotpSecret());
  });
});
