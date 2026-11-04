import { generateKeyPairSync } from 'node:crypto';

import { ISO_DATE_TIME_REGEX } from '../common/constants/regex';
import { InvalidArgumentError } from '../common/exceptions/base.exception';
import { JwtKeyring, JwtKeyMaterial } from '../libs/jwt';

const DEFAULT_ISSUER = 'auth-service';

export interface JwtConfig {
  keyring: JwtKeyring;
  issuer: string;
  legacySecret: string | undefined;
  ephemeral: boolean;
}

export interface ResolveJwtConfigOptions {
  env?: NodeJS.ProcessEnv;
}

interface RetiredKeyEntry {
  kid: string;
  publicKey: string;
  publishedAt?: string;
}

let ephemeralKeyPair: { privateKey: string; publicKey: string } | undefined;

const normalizePem = (value: string): string => value.replace(/\\n/g, '\n');

const isIsoDateTime = (value: string): boolean => {
  const match = ISO_DATE_TIME_REGEX.exec(value);

  if (!match || Number.isNaN(Date.parse(value))) {
    return false;
  }

  const [, year, month, day] = match;
  const daysInMonth = new Date(
    Date.UTC(Number(year), Number(month), 0),
  ).getUTCDate();

  return Number(day) <= daysInMonth;
};

const readPem = (env: NodeJS.ProcessEnv, key: string): string | undefined => {
  const value = env[key]?.trim();

  return value ? normalizePem(value) : undefined;
};

const parseRetiredKeys = (rawValue: string | undefined): RetiredKeyEntry[] => {
  if (!rawValue?.trim()) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new InvalidArgumentError(
      'JWT_RETIRED_PUBLIC_KEYS must be a JSON array',
    );
  }

  if (!Array.isArray(parsed)) {
    throw new InvalidArgumentError(
      'JWT_RETIRED_PUBLIC_KEYS must be a JSON array',
    );
  }

  return parsed.map((entry: unknown) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as RetiredKeyEntry).kid !== 'string' ||
      !(entry as RetiredKeyEntry).kid.trim() ||
      typeof (entry as RetiredKeyEntry).publicKey !== 'string' ||
      !(entry as RetiredKeyEntry).publicKey.trim()
    ) {
      throw new InvalidArgumentError(
        'JWT_RETIRED_PUBLIC_KEYS entries must be { kid, publicKey, publishedAt? } objects with string values',
      );
    }

    const { kid, publicKey, publishedAt } = entry as RetiredKeyEntry;

    if (
      publishedAt !== undefined &&
      (typeof publishedAt !== 'string' || !isIsoDateTime(publishedAt))
    ) {
      throw new InvalidArgumentError(
        'JWT_RETIRED_PUBLIC_KEYS entries publishedAt must be a valid ISO date',
      );
    }

    return {
      kid: kid.trim(),
      publicKey: normalizePem(publicKey),
      ...(publishedAt === undefined ? {} : { publishedAt }),
    };
  });
};

const generateEphemeralKeyPair = (): {
  privateKey: string;
  publicKey: string;
} => {
  ephemeralKeyPair ??= generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return ephemeralKeyPair;
};

export const resolveJwtConfig = (
  options: ResolveJwtConfigOptions = {},
): JwtConfig => {
  const env = options.env ?? process.env;
  const privateKey = readPem(env, 'JWT_PRIVATE_KEY');
  const publicKey = readPem(env, 'JWT_PUBLIC_KEY');
  const kid = env.JWT_KEY_ID?.trim();
  const keyPublishedAt = env.JWT_KEY_PUBLISHED_AT?.trim() || undefined;
  const issuer = env.JWT_ISSUER?.trim() || DEFAULT_ISSUER;
  const legacySecret = env.JWT_SECRET?.trim() || undefined;
  const retiredKeys = parseRetiredKeys(env.JWT_RETIRED_PUBLIC_KEYS);
  const allowEphemeralKeys =
    env.JWT_ALLOW_EPHEMERAL_KEYS?.trim().toLowerCase() === 'true';

  if (keyPublishedAt && !isIsoDateTime(keyPublishedAt)) {
    throw new InvalidArgumentError(
      'JWT_KEY_PUBLISHED_AT must be a valid ISO date',
    );
  }

  if (!privateKey) {
    if (publicKey) {
      throw new InvalidArgumentError(
        'JWT_PUBLIC_KEY requires JWT_PRIVATE_KEY to be configured',
      );
    }
    if (!allowEphemeralKeys) {
      throw new InvalidArgumentError(
        'JWT_PRIVATE_KEY is required; set JWT_ALLOW_EPHEMERAL_KEYS=true only for local or test environments',
      );
    }
    if (env.NODE_ENV === 'production') {
      throw new InvalidArgumentError(
        'Ephemeral JWT keys cannot be used when NODE_ENV=production',
      );
    }
  }

  const ephemeral = privateKey === undefined;
  const signingPair = privateKey
    ? { privateKey, ...(publicKey ? { publicKey } : {}) }
    : generateEphemeralKeyPair();

  const activeKey: JwtKeyMaterial = {
    ...signingPair,
    ...(kid ? { kid } : {}),
    ...(keyPublishedAt ? { publishedAt: keyPublishedAt } : {}),
    active: true,
  };
  const materials: JwtKeyMaterial[] = [activeKey, ...retiredKeys];

  return {
    keyring: new JwtKeyring(materials),
    issuer,
    legacySecret,
    ephemeral,
  };
};
