import type { SchemaDefinitionProperty } from 'mongoose';

import {
  SETTINGS_FIELD_DESCRIPTORS,
  SETTINGS_FIELDS,
  type SettingsField,
  type SettingsFieldDescriptor,
} from './settings.validation';

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

/** Builds one Mongoose path from the shared settings descriptor. */
export const buildSettingsField = (
  field: SettingsField,
): SchemaDefinitionProperty => {
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

/** Every settings field as a Mongoose definition, bound to the shared rules. */
export const buildSettingsFieldsDefinition = (): Record<
  SettingsField,
  SchemaDefinitionProperty
> =>
  Object.fromEntries(
    SETTINGS_FIELDS.map((field) => [field, buildSettingsField(field)]),
  ) as Record<SettingsField, SchemaDefinitionProperty>;
