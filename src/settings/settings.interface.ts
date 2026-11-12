export enum MfaPolicy {
  OPTIONAL = 'optional',
  REQUIRED = 'required',
  DISABLED = 'disabled',
}

/**
 * Per-application overrides of the global defaults.
 *
 * Units are part of the contract: token lifetimes carry their unit in the
 * field name (`*Seconds`), mirroring the seconds-based
 * `JWT_EXPIRATION`/`JWT_REFRESH_EXPIRATION` values (see
 * `resolveAccessTokenTtl`/`resolveRefreshTokenTtl`), while `invitationTtlMs`
 * is expressed in milliseconds. Every field is optional because an absent
 * value means "inherit the global setting".
 */
export interface ApplicationSettings {
  /** Access token lifetime in **seconds** (e.g. `3600` = one hour). */
  accessTokenTtlSeconds?: number;
  /** Refresh token lifetime in **seconds** (e.g. `86400` = one day). */
  refreshTokenTtlSeconds?: number;
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
  /** Maximum login attempts per window for this application. */
  loginRateLimitMax?: number;
  /** Login rate-limit window in **milliseconds**. */
  loginRateLimitWindowMs?: number;
  /** Maximum refresh requests per window for this application. */
  refreshRateLimitMax?: number;
  /** Refresh rate-limit window in **milliseconds**. */
  refreshRateLimitWindowMs?: number;
  /** Maximum MFA verifications per window for this application. */
  mfaRateLimitMax?: number;
  /** MFA rate-limit window in **milliseconds**. */
  mfaRateLimitWindowMs?: number;
  /** Maximum management writes per window for this application. */
  managementRateLimitMax?: number;
  /** Management rate-limit window in **milliseconds**. */
  managementRateLimitWindowMs?: number;
}

export type ApplicationSettingsInput = Partial<ApplicationSettings>;
