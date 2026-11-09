import type { ApplicationSettings } from './settings.interface';
import type { SettingsField } from './settings.validation';

/** Where the effective value of a setting comes from. */
export type SettingSource =
  | 'application'
  | 'global'
  | 'environment'
  | 'default';

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
  updateApplicationSettings(
    applicationId: string,
    patch: Record<string, unknown>,
  ): Promise<ResolvedSettings>;
  updateGlobalSettings(
    patch: Record<string, unknown>,
  ): Promise<ResolvedSettings>;
}
