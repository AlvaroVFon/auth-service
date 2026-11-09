import { model, Schema } from 'mongoose';

import {
  GLOBAL_SETTINGS_KEY,
  type GlobalSettingsDocument,
} from './settings-global.interface';
import { buildSettingsFieldsDefinition } from './settings.mongoose';

const globalSettingsSchema = new Schema<GlobalSettingsDocument>(
  {
    _id: { type: String, default: GLOBAL_SETTINGS_KEY },
    ...buildSettingsFieldsDefinition(),
  },
  { timestamps: true, strict: 'throw', versionKey: false },
);

export const GlobalSettingsModel = model<GlobalSettingsDocument>(
  'GlobalSettings',
  globalSettingsSchema,
);
