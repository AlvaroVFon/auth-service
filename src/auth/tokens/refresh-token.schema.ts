import { Schema, model } from 'mongoose';
import { TokenTypes } from '../../libs/jwt/token-types.enum';
import { RefreshToken } from './refresh-token.interface';

const RefreshTokenSchema = new Schema<RefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByToken: { type: String, default: null },
    type: {
      type: String,
      enum: [TokenTypes.REFRESH],
      default: TokenTypes.REFRESH,
    },
  },
  { timestamps: true },
);

RefreshTokenSchema.index({ userId: 1, expiresAt: 1, revokedAt: 1 });

export const RefreshTokenModel = model<RefreshToken>(
  'RefreshToken',
  RefreshTokenSchema,
);
