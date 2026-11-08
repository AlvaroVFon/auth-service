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

/** Reads the global settings stored in the database. */
export interface GlobalSettingsPort {
  get(): Promise<Partial<ApplicationSettings>>;
}

export interface SettingsPort {
  resolveForApplication(applicationId: string): Promise<ResolvedSettings>;
  resolveGlobal(): Promise<ResolvedSettings>;
}
