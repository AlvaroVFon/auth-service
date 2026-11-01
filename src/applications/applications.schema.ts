import { Schema, model } from 'mongoose';

import { Application } from './applications.interface';

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
  },
  { timestamps: true },
);

export const ApplicationModel = model<Application>(
  'Application',
  applicationSchema,
);
