import { Schema, model } from 'mongoose';
import { ConfigEntry } from '../config-service.interface';

export const ConfigEntrySchema = new Schema<ConfigEntry>(
  {
    key: { type: String, required: true, unique: true },
    active: { type: Boolean, required: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

export const ConfigEntryModel = model<ConfigEntry>(
  'ConfigEntry',
  ConfigEntrySchema,
  'config',
);
