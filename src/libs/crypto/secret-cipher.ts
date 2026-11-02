import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { InvalidArgumentError } from '../../common/exceptions/base.exception';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/**
 * Encrypts secrets at rest with AES-256-GCM. Values without the version
 * prefix are treated as legacy plaintext so existing rows keep working while
 * they are rewritten.
 */
export class SecretCipher {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    const key = Buffer.from(keyBase64, 'base64');

    if (key.length !== KEY_BYTES) {
      throw new InvalidArgumentError(
        'MFA_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
      );
    }

    this.key = key;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);

    return [
      VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt(value: string): string {
    if (!value.startsWith(`${VERSION}:`)) {
      return value;
    }

    const [version, iv, tag, data] = value.split(':');

    if (version !== VERSION || !iv || !tag || !data) {
      throw new InvalidArgumentError('Invalid encrypted secret');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
