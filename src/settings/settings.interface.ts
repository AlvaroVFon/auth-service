export enum MfaPolicy {
  OPTIONAL = 'optional',
  REQUIRED = 'required',
  DISABLED = 'disabled',
}

export interface ApplicationSettings {
  accessTokenTtl?: number;
  refreshTokenTtl?: number;
  mfaPolicy?: MfaPolicy;
  maxSessionsPerUser?: number;
  requireVerifiedEmail?: boolean;
  invitationTtlMs?: number;
  appName?: string;
}

export type ApplicationSettingsInput = Partial<ApplicationSettings>;
