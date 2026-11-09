import { Schema, model } from 'mongoose';

import { Roles } from '../common/enums/roles.enum';
import { User as UserInterface } from './users.interface';

const userSchema = new Schema<UserInterface>(
  {
    username: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: Roles,
      default: Roles.USER,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: { type: Date, default: null },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockoutUntil: {
      type: Date,
      default: null,
    },
    telegramChatId: {
      type: String,
      trim: true,
      match: /^-?\d{1,20}$/,
    },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String },
    mfaPendingSecret: { type: String },
    mfaRecoveryCodes: { type: [String], default: [] },
    mfaFailedAttempts: { type: Number, default: 0 },
    mfaLockoutUntil: { type: Date, default: null },
    mfaLastUsedStep: { type: Number },
  },
  {
    timestamps: true,
    toJSON: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transform: (_doc, ret: any) => {
        delete ret.password;
        delete ret.loginAttempts;
        delete ret.lockoutUntil;
        delete ret.mfaSecret;
        delete ret.mfaPendingSecret;
        delete ret.mfaRecoveryCodes;
        delete ret.mfaFailedAttempts;
        delete ret.mfaLockoutUntil;
        delete ret.mfaLastUsedStep;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.index(
  { role: 1 },
  {
    unique: true,
    partialFilterExpression: { role: Roles.OWNER },
  },
);

// Every listing order ends in `_id` (stable pagination), so each sortable
// field needs the compound index; MongoDB can scan it in reverse for the
// descending direction. The case-insensitive `q` prefix search cannot use a
// b-tree index by design and scans the collection.
userSchema.index({ email: 1, _id: 1 });
userSchema.index({ username: 1, _id: 1 });
userSchema.index({ role: 1, _id: 1 });
userSchema.index({ verified: 1, _id: 1 });
// Support the active-lockout counter (login and MFA) without a scan.
userSchema.index({ lockoutUntil: 1 });
userSchema.index({ mfaLockoutUntil: 1 });
userSchema.index({ createdAt: 1, _id: 1 });

export const User = model<UserInterface>('User', userSchema);

/** Physical collection name, reused by cross-domain aggregations. */
export const USERS_COLLECTION_NAME = User.collection.name;
