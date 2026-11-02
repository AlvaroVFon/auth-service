import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_WINDOW = 1;

export const base32Encode = (buffer: Buffer): string => {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
};

export const base32Decode = (input: string): Buffer => {
  const normalized = input.toUpperCase().replace(/[\s=]/g, '');

  if (!/^[A-Z2-7]*$/.test(normalized)) {
    throw new Error('Invalid Base32 value');
  }

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const character of normalized) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
};

export const generateTotpSecret = (bytes: number = 20): string =>
  base32Encode(randomBytes(bytes));

export const generateTotp = (
  secret: string,
  timestampMs: number = Date.now(),
  digits: number = DEFAULT_DIGITS,
  periodSeconds: number = DEFAULT_PERIOD_SECONDS,
): string => {
  const counter = Math.floor(timestampMs / 1000 / periodSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', base32Decode(secret))
    .update(counterBuffer)
    .digest();

  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, '0');
};

const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

export const verifyTotp = (
  secret: string,
  code: string,
  timestampMs: number = Date.now(),
  window: number = DEFAULT_WINDOW,
): boolean => {
  if (!new RegExp(`^\\d{${DEFAULT_DIGITS}}$`).test(code)) {
    return false;
  }

  for (let offset = -window; offset <= window; offset++) {
    const candidate = generateTotp(
      secret,
      timestampMs + offset * DEFAULT_PERIOD_SECONDS * 1000,
    );

    if (safeEqual(candidate, code)) {
      return true;
    }
  }

  return false;
};
