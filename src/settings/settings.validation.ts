import { InvalidArgumentError } from '../common/exceptions/base.exception';
import {
  ApplicationSettings,
  ApplicationSettingsInput,
  MfaPolicy,
} from './settings.interface';

export const MFA_POLICIES = Object.freeze(
  Object.values(MfaPolicy),
) as readonly MfaPolicy[];

/** Keys accepted by `ApplicationSettings`, used as the single source of truth. */
export type SettingsField = keyof ApplicationSettings;

/** Primitive backing a settings field in the persistence layer. */
export type SettingsFieldType = 'number' | 'string' | 'boolean';

export interface SettingsFieldDescriptor {
  /** Primitive type of the field, shared by the schema definition. */
  readonly type: SettingsFieldType;
  /** Domain predicate reused by the schema validators. */
  readonly validate: (value: unknown) => boolean;
  /** Message reported when the predicate rejects a value. */
  readonly message: string;
  /** Accepted values when the field is constrained to an enumeration. */
  readonly enumValues?: readonly string[];
  /** Whether string values are trimmed before being persisted. */
  readonly trim?: boolean;
}

export const SETTINGS_VALIDATION_MESSAGES = {
  settings: 'settings must be an object',
} as const;

export const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

export const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

export const isMfaPolicy = (value: unknown): value is MfaPolicy =>
  typeof value === 'string' && MFA_POLICIES.includes(value as MfaPolicy);

export const isBoolean = (value: unknown): value is boolean =>
  typeof value === 'boolean';

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Single source of truth for the settings contract: the domain validation, the
 * allowed keys and the Mongoose schema are all derived from this map.
 *
 * Token TTLs are in seconds (`accessTokenTtl`, `refreshTokenTtl`) whereas
 * `invitationTtlMs` is in milliseconds; the units are kept explicit in each
 * message and in `ApplicationSettings`.
 */
export const SETTINGS_FIELD_DESCRIPTORS = {
  accessTokenTtl: {
    type: 'number',
    validate: isNonNegativeInteger,
    message: 'accessTokenTtl must be a non-negative integer (seconds)',
  },
  refreshTokenTtl: {
    type: 'number',
    validate: isNonNegativeInteger,
    message: 'refreshTokenTtl must be a non-negative integer (seconds)',
  },
  mfaPolicy: {
    type: 'string',
    validate: isMfaPolicy,
    message: `mfaPolicy must be one of ${MFA_POLICIES.join(', ')}`,
    enumValues: MFA_POLICIES,
  },
  maxSessionsPerUser: {
    type: 'number',
    validate: isPositiveInteger,
    message: 'maxSessionsPerUser must be a positive integer',
  },
  requireVerifiedEmail: {
    type: 'boolean',
    validate: isBoolean,
    message: 'requireVerifiedEmail must be a boolean',
  },
  invitationTtlMs: {
    type: 'number',
    validate: isNonNegativeInteger,
    message: 'invitationTtlMs must be a non-negative integer (milliseconds)',
  },
  appName: {
    type: 'string',
    validate: isNonEmptyString,
    message: 'appName must be a non-empty string',
    trim: true,
  },
} as const satisfies Record<SettingsField, SettingsFieldDescriptor>;

export const SETTINGS_FIELDS = Object.freeze(
  Object.keys(SETTINGS_FIELD_DESCRIPTORS) as SettingsField[],
);

const isSettingsField = (key: string): key is SettingsField =>
  (SETTINGS_FIELDS as readonly string[]).includes(key);

const normalizeValue = (
  descriptor: SettingsFieldDescriptor,
  value: unknown,
): unknown =>
  descriptor.trim === true && typeof value === 'string' ? value.trim() : value;

const assertKnownSettingsFields = (input: ApplicationSettingsInput): void => {
  const unknown = Object.keys(input).find((key) => !isSettingsField(key));

  if (unknown !== undefined) {
    throw new InvalidArgumentError(`settings has unknown field '${unknown}'`);
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

  assertKnownSettingsFields(input);

  const settings: ApplicationSettings = {};

  for (const field of SETTINGS_FIELDS) {
    const value = input[field];

    if (value === undefined) {
      continue;
    }

    const descriptor = SETTINGS_FIELD_DESCRIPTORS[field];

    if (!descriptor.validate(value)) {
      throw new InvalidArgumentError(descriptor.message);
    }

    Object.assign(settings, { [field]: normalizeValue(descriptor, value) });
  }

  return settings;
};
