import type { ApplicationSettings } from './settings.interface';
import type { SettingsField } from './settings.validation';

/** Where the effective value of a setting comes from. */
export type SettingSource =
  | 'application'
  | 'global'
  | 'environment'
  | 'default';

/** Route family a rate-limit policy applies to. */
export const RATE_LIMIT_ROUTES = [
  'login',
  'refresh',
  'mfa',
  'management',
] as const;

export type RateLimitRoute = (typeof RATE_LIMIT_ROUTES)[number];

/** Effective rate-limit policy of one route for one application. */
export interface RateLimitPolicy {
  windowMs: number;
  max: number;
}

export interface ResolvedSetting<T> {
  value: T;
  source: SettingSource;
}

/**
 * Effective policy of an application, field by field, with the provenance of
 * every value so later deliveries can tell an override from an inherited one.
 */
export type ResolvedSettings = {
  [K in SettingsField]: ResolvedSetting<NonNullable<ApplicationSettings[K]>>;
};

/** Validated changes applied by a settings write. */
export interface SettingsChanges {
  set: ApplicationSettings;
  unset: SettingsField[];
}

/** Persists the overrides of one application. */
export interface ApplicationSettingsWriterPort {
  updateSettings(
    applicationId: string,
    changes: SettingsChanges,
  ): Promise<void>;
}

/** Reads and writes the global settings stored in the database. */
export interface GlobalSettingsPort {
  get(): Promise<Partial<ApplicationSettings>>;
  update?(changes: SettingsChanges): Promise<void>;
}

export interface SettingsPort {
  resolveForApplication(applicationId: string): Promise<ResolvedSettings>;
  /**
   * Resolves the application and the global layer from the same snapshot so
   * the response can show exactly the layer the application inherited from.
   */
  resolveApplicationWithGlobal(
    applicationId: string,
  ): Promise<{ application: ResolvedSettings; global: ResolvedSettings }>;
  resolveGlobal(): Promise<ResolvedSettings>;
  /**
   * Resolves the rate-limit policy of one route for an application, honoring
   * its override, the global layer, the environment and the code defaults.
   * An absent application uses the global layer.
   */
  resolveRateLimitPolicy(
    applicationId: string | undefined,
    route: RateLimitRoute,
  ): Promise<RateLimitPolicy>;
  updateApplicationSettings(
    applicationId: string,
    patch: Record<string, unknown>,
  ): Promise<ResolvedSettings>;
  updateGlobalSettings(
    patch: Record<string, unknown>,
  ): Promise<ResolvedSettings>;
}
