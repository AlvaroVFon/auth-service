import { Schema, model } from 'mongoose';
import { BlacklistedToken } from './blacklisted-token.interface';

const BlacklistedTokenSchema = new Schema<BlacklistedToken>(
  {
    jti: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

export const BlacklistedTokenModel = model<BlacklistedToken>(
  'BlacklistedToken',
  BlacklistedTokenSchema,
);
