import type { Model } from 'mongoose';

import {
  GLOBAL_SETTINGS_KEY,
  type GlobalSettingsDocument,
} from './settings-global.interface';
import { GlobalSettingsModel } from './settings-global.schema';
import type { ApplicationSettings } from './settings.interface';
import type { GlobalSettingsPort, SettingsChanges } from './settings.port';
import { SETTINGS_FIELDS } from './settings.validation';

export class GlobalSettingsRepository implements GlobalSettingsPort {
  constructor(
    private readonly model: Model<GlobalSettingsDocument> = GlobalSettingsModel,
  ) {}

  async get(): Promise<Partial<ApplicationSettings>> {
    const document = await this.model
      .findById(GLOBAL_SETTINGS_KEY)
      .lean<GlobalSettingsDocument | null>();

    if (!document) {
      return {};
    }

    const settings: Partial<ApplicationSettings> = {};

    for (const field of SETTINGS_FIELDS) {
      const value = document[field];
      if (value !== undefined && value !== null) {
        settings[field] = value as never;
      }
    }

    return settings;
  }

  async update(changes: SettingsChanges): Promise<void> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};

    for (const [field, value] of Object.entries(changes.set)) {
      $set[field] = value;
    }
    for (const field of changes.unset) {
      $unset[field] = 1;
    }

    if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
      return;
    }

    await this.model.updateOne(
      { _id: GLOBAL_SETTINGS_KEY },
      {
        ...(Object.keys($set).length === 0 ? {} : { $set }),
        ...(Object.keys($unset).length === 0 ? {} : { $unset }),
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }
}
