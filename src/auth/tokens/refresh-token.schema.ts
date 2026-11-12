import { randomUUID } from 'node:crypto';

import { Schema, model } from 'mongoose';

import { TokenTypes } from '../../libs/jwt';
import { RefreshToken } from './refresh-token.interface';

const RefreshTokenSchema = new Schema<RefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    sessionId: {
      type: String,
      required: true,
      default: () => randomUUID(),
    },
    jti: { type: String, required: true, unique: true },
    audience: { type: String, default: null },
    sessionStartedAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    lastActivityAt: { type: Date, default: () => new Date() },
    revokedAt: { type: Date, default: null },
    revocationBatchId: { type: String },
    replacedByJti: { type: String, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    type: {
      type: String,
      enum: [TokenTypes.REFRESH],
      default: TokenTypes.REFRESH,
    },
  },
  { timestamps: true },
);

RefreshTokenSchema.index({ userId: 1, expiresAt: 1, revokedAt: 1 });
RefreshTokenSchema.index({ userId: 1, sessionId: 1, revokedAt: 1 });
RefreshTokenSchema.index({ userId: 1, revokedAt: 1, lastActivityAt: -1 });
RefreshTokenSchema.index({ audience: 1, revokedAt: 1, expiresAt: 1 });
// Global active-session counter: both predicates are indexed, with no user or
// audience prefix that would force a collection scan.
RefreshTokenSchema.index({ revokedAt: 1, expiresAt: 1 });
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
RefreshTokenSchema.index(
  { revocationBatchId: 1 },
  { partialFilterExpression: { revocationBatchId: { $exists: true } } },
);

export const RefreshTokenModel = model<RefreshToken>(
  'RefreshToken',
  RefreshTokenSchema,
);
