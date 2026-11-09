import type { ApplicationSettings } from './settings.interface';

/** Fixed `_id` of the singleton global settings document. */
export const GLOBAL_SETTINGS_KEY = 'global';

export interface GlobalSettingsDocument extends ApplicationSettings {
  _id: string;
  createdAt?: Date;
  updatedAt?: Date;
}
