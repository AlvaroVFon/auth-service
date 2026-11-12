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

/** Result of a settings write: the effective policy and the applied changes. */
export interface ApplicationSettingsUpdate {
  resolved: ResolvedSettings;
  /** Only the changes that altered the stored overrides. */
  applied: SettingsChanges;
}

/** Persists the overrides of one application. */
export interface ApplicationSettingsWriterPort {
  /**
   * Applies the changes to an **active** application. Rejects an unknown or
   * archived application with `EntityNotFoundError`; the update must be
   * conditional on `active: true` so an archive racing the write wins.
   * Returns the subset of changes that altered the stored document, so the
   * caller audits exactly what this write applied.
   */
  updateSettings(
    applicationId: string,
    changes: SettingsChanges,
  ): Promise<SettingsChanges>;
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
  ): Promise<ApplicationSettingsUpdate>;
  updateGlobalSettings(
    patch: Record<string, unknown>,
  ): Promise<ResolvedSettings>;
}
