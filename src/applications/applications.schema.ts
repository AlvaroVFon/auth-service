import { Schema, model } from 'mongoose';

import { MfaPolicy, ApplicationSettings } from '../settings/settings.interface';
import {
  isNonEmptyString,
  isNonNegativeInteger,
  isPositiveInteger,
  SETTINGS_VALIDATION_MESSAGES,
} from '../settings/settings.validation';
import { Application } from './applications.interface';

const applicationSettingsSchema = new Schema<ApplicationSettings>(
  {
    accessTokenTtl: {
      type: Number,
      validate: {
        validator: isNonNegativeInteger,
        message: SETTINGS_VALIDATION_MESSAGES.accessTokenTtl,
      },
    },
    refreshTokenTtl: {
      type: Number,
      validate: {
        validator: isNonNegativeInteger,
        message: SETTINGS_VALIDATION_MESSAGES.refreshTokenTtl,
      },
    },
    mfaPolicy: {
      type: String,
      enum: {
        values: Object.values(MfaPolicy),
        message: SETTINGS_VALIDATION_MESSAGES.mfaPolicy,
      },
    },
    maxSessionsPerUser: {
      type: Number,
      validate: {
        validator: isPositiveInteger,
        message: SETTINGS_VALIDATION_MESSAGES.maxSessionsPerUser,
      },
    },
    requireVerifiedEmail: { type: Boolean },
    invitationTtlMs: {
      type: Number,
      validate: {
        validator: isNonNegativeInteger,
        message: SETTINGS_VALIDATION_MESSAGES.invitationTtlMs,
      },
    },
    appName: {
      type: String,
      trim: true,
      validate: {
        validator: isNonEmptyString,
        message: SETTINGS_VALIDATION_MESSAGES.appName,
      },
    },
  },
  { _id: false },
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

export const ApplicationModel = model<Application>(
  'Application',
  applicationSchema,
);
