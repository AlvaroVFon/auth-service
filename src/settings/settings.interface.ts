export enum MfaPolicy {
  OPTIONAL = 'optional',
  REQUIRED = 'required',
  DISABLED = 'disabled',
}

/**
 * Per-application overrides of the global defaults.
 *
 * Units are explicit in the field names or in their documentation: the token
 * TTLs mirror the seconds-based `JWT_EXPIRATION`/`JWT_REFRESH_EXPIRATION`
 * values (see `resolveAccessTokenTtl`/`resolveRefreshTokenTtl`), while
 * `invitationTtlMs` is expressed in milliseconds. Every field is optional
 * because an absent value means "inherit the global setting".
 */
export interface ApplicationSettings {
  /** Access token lifetime in **seconds** (e.g. `3600` = one hour). */
  accessTokenTtl?: number;
  /** Refresh token lifetime in **seconds** (e.g. `86400` = one day). */
  refreshTokenTtl?: number;
  /** MFA enforcement level for users of the application. */
  mfaPolicy?: MfaPolicy;
  /** Maximum number of concurrent sessions kept per user. */
  maxSessionsPerUser?: number;
  /** Whether users must verify their email before signing in. */
  requireVerifiedEmail?: boolean;
  /** Invitation link lifetime in **milliseconds** (e.g. `604800000` = one week). */
  invitationTtlMs?: number;
  /** Display name of the application in emails and authenticator entries. */
  appName?: string;
}

export type ApplicationSettingsInput = Partial<ApplicationSettings>;
