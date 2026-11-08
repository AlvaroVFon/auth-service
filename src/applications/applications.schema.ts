import { Schema, model } from 'mongoose';

import { ApplicationSettings } from '../settings/settings.interface';
import { buildSettingsFieldsDefinition } from '../settings/settings.mongoose';
import { Application } from './applications.interface';

const settingsDefinition = buildSettingsFieldsDefinition();

const applicationSettingsSchema = new Schema<ApplicationSettings>(
  settingsDefinition,
  { _id: false, strict: 'throw' },
);

const applicationSchema = new Schema<Application>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    audience: { type: String, required: true, unique: true, trim: true },
    active: { type: Boolean, default: true },
    settings: { type: applicationSettingsSchema, required: false },
  },
  { timestamps: true },
);

// Every listing order ends in `_id` (stable pagination), so each sortable
// field gets the compound index; MongoDB can scan it in reverse for the
// descending direction. The case-insensitive `q` prefix search cannot use a
// b-tree index by design and scans the small catalog.
applicationSchema.index({ name: 1, _id: 1 });
applicationSchema.index({ slug: 1, _id: 1 });
applicationSchema.index({ audience: 1, _id: 1 });
applicationSchema.index({ active: 1, _id: 1 });
applicationSchema.index({ createdAt: 1, _id: 1 });

export const ApplicationModel = model<Application>(
  'Application',
  applicationSchema,
);
