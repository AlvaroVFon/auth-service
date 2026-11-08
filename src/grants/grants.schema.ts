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
// The member listing filters by application and sorts by membership date or
// role; each order ends in `_id` for stable pagination.
grantSchema.index({ applicationId: 1, createdAt: 1, _id: 1 });
grantSchema.index({ applicationId: 1, role: 1, _id: 1 });

export const GrantModel = model<Grant>('Grant', grantSchema);
