import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import { SecretCipher } from '../../../../src/libs/crypto';

const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

describe('SecretCipher', () => {
  test('should round-trip a secret with a versioned ciphertext', () => {
    const cipher = new SecretCipher(KEY);
    const encrypted = cipher.encrypt('JBSWY3DPEHPK3PXP');

    assert.notStrictEqual(encrypted, 'JBSWY3DPEHPK3PXP');
    assert.ok(encrypted.startsWith('v1:'));
    assert.strictEqual(cipher.decrypt(encrypted), 'JBSWY3DPEHPK3PXP');
  });

  test('should keep legacy plaintext values readable', () => {
    const cipher = new SecretCipher(KEY);

    assert.strictEqual(cipher.decrypt('JBSWY3DPEHPK3PXP'), 'JBSWY3DPEHPK3PXP');
  });

  test('should reject a key with the wrong length', () => {
    assert.throws(
      () => new SecretCipher('not-a-32-byte-key'),
      new InvalidArgumentError(
        'MFA_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
      ),
    );
  });

  test('should reject a tampered ciphertext', () => {
    const cipher = new SecretCipher(KEY);
    const encrypted = cipher.encrypt('JBSWY3DPEHPK3PXP');
    const tampered = `${encrypted.slice(0, -4)}AAAA`;

    assert.throws(() => cipher.decrypt(tampered));
  });
});
