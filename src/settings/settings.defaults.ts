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
  });

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

  const accessTokenTtlSeconds = readNumber('JWT_EXPIRATION');
  if (accessTokenTtlSeconds !== undefined) {
    settings.accessTokenTtlSeconds = accessTokenTtlSeconds;
  }

  const refreshTokenTtlSeconds =
    readNumber('JWT_REFRESH_EXPIRATION') ??
    readNumber('JWT_REFRESH_EXPIRES_IN');
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

  return settings;
};
