import { InvalidArgumentError } from '../common/exceptions/base.exception';
import { getStringEnvVariable } from '../config/env.config';
import { ApplicationSettings, MfaPolicy } from './settings.interface';

/**
 * Documented fallback when neither the database nor the environment define a
 * field. The values mirror the historical service defaults, so enabling the
 * settings layer does not change behavior on its own.
 */
export const SETTINGS_CODE_DEFAULTS: Readonly<Required<ApplicationSettings>> =
  Object.freeze({
    accessTokenTtlSeconds: 3600,
    refreshTokenTtlSeconds: 86400,
    mfaPolicy: MfaPolicy.OPTIONAL,
    maxSessionsPerUser: 50,
    requireVerifiedEmail: true,
    invitationTtlMs: 604800000,
    appName: 'Auth Service',
    loginRateLimitMax: 5,
    loginRateLimitWindowMs: 900000,
    refreshRateLimitMax: 60,
    refreshRateLimitWindowMs: 900000,
    mfaRateLimitMax: 10,
    mfaRateLimitWindowMs: 900000,
    managementRateLimitMax: 30,
    managementRateLimitWindowMs: 900000,
  });

const readInteger = (name: string): number | undefined => {
  const raw = getStringEnvVariable(name, '').trim();

  if (raw === '') {
    return undefined;
  }

  // Mirrors the composition's `parseInt(..., 10)` so a value such as `3600s`
  // resolves to the same TTL the token service already uses.
  const value = parseInt(raw, 10);

  if (!Number.isFinite(value)) {
    throw new InvalidArgumentError(`${name} must be a number`);
  }

  return value;
};

const readNumber = (name: string): number | undefined => {
  const raw = getStringEnvVariable(name, '').trim();

  if (raw === '') {
    return undefined;
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    throw new InvalidArgumentError(`${name} must be a number`);
  }

  return value;
};

const readString = (name: string): string | undefined => {
  const raw = getStringEnvVariable(name, '').trim();

  return raw === '' ? undefined : raw;
};

/**
 * Reads the settings backed by environment variables **at call time**, so a
 * value changed after the service is built is honored. Unset variables are
 * omitted instead of falling back here: the distinction between `environment`
 * and `default` is part of the resolved provenance.
 */
export const resolveEnvironmentSettings = (): Partial<ApplicationSettings> => {
  const settings: Partial<ApplicationSettings> = {};

  const accessTokenTtlSeconds = readInteger('JWT_EXPIRATION');
  if (accessTokenTtlSeconds !== undefined) {
    settings.accessTokenTtlSeconds = accessTokenTtlSeconds;
  }

  const refreshTokenTtlSeconds =
    readInteger('JWT_REFRESH_EXPIRATION') ??
    readInteger('JWT_REFRESH_EXPIRES_IN');
  if (refreshTokenTtlSeconds !== undefined) {
    settings.refreshTokenTtlSeconds = refreshTokenTtlSeconds;
  }

  const maxSessionsPerUser = readNumber('MAX_SESSIONS_PER_USER');
  if (maxSessionsPerUser !== undefined) {
    settings.maxSessionsPerUser = maxSessionsPerUser;
  }

  const invitationTtlMs = readNumber('INVITATION_LINK_EXPIRATION_MS');
  if (invitationTtlMs !== undefined) {
    settings.invitationTtlMs = invitationTtlMs;
  }

  const appName = readString('APP_NAME');
  if (appName !== undefined) {
    settings.appName = appName;
  }

  const rateLimits = [
    ['loginRateLimitMax', 'RATE_LIMIT_LOGIN_MAX', readNumber],
    ['loginRateLimitWindowMs', 'RATE_LIMIT_LOGIN_WINDOW_MS', readNumber],
    ['refreshRateLimitMax', 'RATE_LIMIT_REFRESH_MAX', readNumber],
    ['refreshRateLimitWindowMs', 'RATE_LIMIT_REFRESH_WINDOW_MS', readNumber],
    ['mfaRateLimitMax', 'RATE_LIMIT_MFA_VERIFY_MAX', readNumber],
    ['mfaRateLimitWindowMs', 'RATE_LIMIT_MFA_VERIFY_WINDOW_MS', readNumber],
    ['managementRateLimitMax', 'RATE_LIMIT_MEMBERS_WRITE_MAX', readNumber],
    [
      'managementRateLimitWindowMs',
      'RATE_LIMIT_MEMBERS_WRITE_WINDOW_MS',
      readNumber,
    ],
  ] as const;

  for (const [field, variable, read] of rateLimits) {
    const value = read(variable);
    if (value !== undefined) {
      settings[field] = value;
    }
  }

  return settings;
};
