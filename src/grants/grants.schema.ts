import { Schema, model } from 'mongoose';

import { Grant, GrantRoles } from './grants.interface';

const grantSchema = new Schema<Grant>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(GrantRoles),
      required: true,
    },
  },
  { timestamps: true },
);

grantSchema.index({ userId: 1, applicationId: 1 }, { unique: true });

export const GrantModel = model<Grant>('Grant', grantSchema);
