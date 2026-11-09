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
// The member listing filters by application; these indexes serve that match.
// Its join-and-sort runs as an aggregation, so it cannot use them for the sort.
grantSchema.index({ applicationId: 1, createdAt: 1, _id: 1 });
grantSchema.index({ applicationId: 1, role: 1, _id: 1 });

export const GrantModel = model<Grant>('Grant', grantSchema);
