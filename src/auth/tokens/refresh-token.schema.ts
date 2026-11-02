import { Schema, model } from 'mongoose';

import { TokenTypes } from '../../libs/jwt';
import { RefreshToken } from './refresh-token.interface';

const RefreshTokenSchema = new Schema<RefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    jti: { type: String, required: true, unique: true },
    audience: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
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
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel = model<RefreshToken>(
  'RefreshToken',
  RefreshTokenSchema,
);
