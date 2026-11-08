import type { Model } from 'mongoose';

import {
  GLOBAL_SETTINGS_KEY,
  type GlobalSettingsDocument,
} from './settings-global.interface';
import { GlobalSettingsModel } from './settings-global.schema';
import { resolveEnvironmentSettings } from './settings.defaults';
import type { ApplicationSettings } from './settings.interface';
import { validateApplicationSettings } from './settings.validation';

/**
 * Creates the singleton global settings document from the environment the
 * first time it runs. `$setOnInsert` makes it idempotent: an existing document
 * is never updated, so values edited through the API survive a restart.
 */
export const ensureGlobalSettings = async (
  model: Model<GlobalSettingsDocument> = GlobalSettingsModel,
  environment: Partial<ApplicationSettings> = resolveEnvironmentSettings(),
): Promise<void> => {
  const settings = validateApplicationSettings(environment) ?? {};

  await model.updateOne(
    { _id: GLOBAL_SETTINGS_KEY },
    { $setOnInsert: { ...settings } },
    { upsert: true, setDefaultsOnInsert: true },
  );
};
