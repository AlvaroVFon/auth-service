import { InvalidArgumentError } from '../common/exceptions/base.exception';
import {
  ApplicationSettings,
  ApplicationSettingsInput,
  MfaPolicy,
} from './settings.interface';

export const MFA_POLICIES = Object.values(MfaPolicy);

export const SETTINGS_VALIDATION_MESSAGES = {
  settings: 'settings must be an object',
  accessTokenTtl: 'accessTokenTtl must be a non-negative integer',
  refreshTokenTtl: 'refreshTokenTtl must be a non-negative integer',
  invitationTtlMs: 'invitationTtlMs must be a non-negative integer',
  maxSessionsPerUser: 'maxSessionsPerUser must be a positive integer',
  mfaPolicy: `mfaPolicy must be one of ${MFA_POLICIES.join(', ')}`,
  requireVerifiedEmail: 'requireVerifiedEmail must be a boolean',
  appName: 'appName must be a non-empty string',
} as const;

export const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

export const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

export const isMfaPolicy = (value: unknown): value is MfaPolicy =>
  typeof value === 'string' && MFA_POLICIES.includes(value as MfaPolicy);

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const assertTtl = (
  value: number | undefined,
  field: 'accessTokenTtl' | 'refreshTokenTtl' | 'invitationTtlMs',
): void => {
  if (value !== undefined && !isNonNegativeInteger(value)) {
    throw new InvalidArgumentError(SETTINGS_VALIDATION_MESSAGES[field]);
  }
};

export const validateApplicationSettings = (
  input?: ApplicationSettingsInput | null,
): ApplicationSettings | undefined => {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidArgumentError(SETTINGS_VALIDATION_MESSAGES.settings);
  }

  assertTtl(input.accessTokenTtl, 'accessTokenTtl');
  assertTtl(input.refreshTokenTtl, 'refreshTokenTtl');
  assertTtl(input.invitationTtlMs, 'invitationTtlMs');

  if (
    input.maxSessionsPerUser !== undefined &&
    !isPositiveInteger(input.maxSessionsPerUser)
  ) {
    throw new InvalidArgumentError(
      SETTINGS_VALIDATION_MESSAGES.maxSessionsPerUser,
    );
  }
  if (input.mfaPolicy !== undefined && !isMfaPolicy(input.mfaPolicy)) {
    throw new InvalidArgumentError(SETTINGS_VALIDATION_MESSAGES.mfaPolicy);
  }
  if (
    input.requireVerifiedEmail !== undefined &&
    typeof input.requireVerifiedEmail !== 'boolean'
  ) {
    throw new InvalidArgumentError(
      SETTINGS_VALIDATION_MESSAGES.requireVerifiedEmail,
    );
  }
  if (input.appName !== undefined && !isNonEmptyString(input.appName)) {
    throw new InvalidArgumentError(SETTINGS_VALIDATION_MESSAGES.appName);
  }

  const settings: ApplicationSettings = {};

  if (input.accessTokenTtl !== undefined) {
    settings.accessTokenTtl = input.accessTokenTtl;
  }
  if (input.refreshTokenTtl !== undefined) {
    settings.refreshTokenTtl = input.refreshTokenTtl;
  }
  if (input.mfaPolicy !== undefined) {
    settings.mfaPolicy = input.mfaPolicy;
  }
  if (input.maxSessionsPerUser !== undefined) {
    settings.maxSessionsPerUser = input.maxSessionsPerUser;
  }
  if (input.requireVerifiedEmail !== undefined) {
    settings.requireVerifiedEmail = input.requireVerifiedEmail;
  }
  if (input.invitationTtlMs !== undefined) {
    settings.invitationTtlMs = input.invitationTtlMs;
  }
  if (input.appName !== undefined) {
    settings.appName = input.appName.trim();
  }

  return settings;
};
