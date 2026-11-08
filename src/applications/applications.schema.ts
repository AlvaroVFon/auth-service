import { Schema, SchemaDefinitionProperty, model } from 'mongoose';

import { ApplicationSettings } from '../settings/settings.interface';
import {
  SETTINGS_FIELD_DESCRIPTORS,
  SETTINGS_FIELDS,
  type SettingsField,
  type SettingsFieldDescriptor,
} from '../settings/settings.validation';
import { Application } from './applications.interface';

const SETTINGS_PRIMITIVES = {
  number: Number,
  string: String,
  boolean: Boolean,
} as const;

/**
 * Mongoose casts `1`, `0`, `'yes'` and `'true'` to booleans *before* running
 * validators, which would accept values rejected by
 * `validateApplicationSettings`. The identity cast disables that coercion so
 * the shared predicate stays authoritative for direct model writes.
 */
const castBooleanWithoutCoercion = (value: boolean): boolean => value;

const buildSettingsPath = (field: SettingsField): SchemaDefinitionProperty => {
  const descriptor: SettingsFieldDescriptor = SETTINGS_FIELD_DESCRIPTORS[field];
  const definition = {
    type: SETTINGS_PRIMITIVES[descriptor.type],
    validate: {
      validator: descriptor.validate,
      message: descriptor.message,
    },
  };

  if (descriptor.type === 'boolean') {
    return { ...definition, cast: castBooleanWithoutCoercion };
  }
  if (descriptor.enumValues !== undefined) {
    return {
      ...definition,
      enum: { values: [...descriptor.enumValues], message: descriptor.message },
    };
  }
  if (descriptor.trim === true) {
    return { ...definition, trim: true };
  }

  return definition;
};

const settingsDefinition = Object.fromEntries(
  SETTINGS_FIELDS.map((field) => [field, buildSettingsPath(field)]),
) as Record<SettingsField, SchemaDefinitionProperty>;

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

// Supports the prefix search of the catalog listing without a collection scan.
applicationSchema.index({ name: 1 });

export const ApplicationModel = model<Application>(
  'Application',
  applicationSchema,
);
