import { Schema, Types, model } from 'mongoose';

import { LockoutScope } from './lockout.interface';

export interface LockoutCounter {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  scope: LockoutScope;
  failedAttempts: number;
  lockoutUntil: Date | null;
  lastFailureAt?: Date;
}

const lockoutSchema = new Schema<LockoutCounter>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    scope: { type: String, required: true },
    failedAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date, default: null },
    lastFailureAt: { type: Date },
  },
  { timestamps: true },
);

lockoutSchema.index({ userId: 1, scope: 1 }, { unique: true });
lockoutSchema.index({ lockoutUntil: 1 });

export const LockoutModel = model<LockoutCounter>(
  'LockoutCounter',
  lockoutSchema,
);
