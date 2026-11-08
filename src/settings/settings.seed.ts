import type { Model } from 'mongoose';

import { isDuplicateKeyError } from '../common/mongo/duplicate-key';
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
  const now = new Date();

  try {
    await model.updateOne(
      { _id: GLOBAL_SETTINGS_KEY },
      { $setOnInsert: { ...settings, createdAt: now, updatedAt: now } },
      // Mongoose would otherwise inject `$set: { updatedAt }` on every restart,
      // turning a no-op seed into a real write.
      { upsert: true, setDefaultsOnInsert: true, timestamps: false },
    );
  } catch (error) {
    // Two instances booting against a fresh database race on the singleton:
    // the loser of the insert just finds it created by the winner.
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }
};
