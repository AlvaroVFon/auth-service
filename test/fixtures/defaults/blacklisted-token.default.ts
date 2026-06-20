import { Types } from 'mongoose';
import { BlacklistedToken } from '../../../src/auth/tokens/blacklisted-token.interface';

export const DEFAULT_BLACKLISTED_TOKEN_ID = new Types.ObjectId();

export const DEFAULT_BLACKLISTED_TOKEN_JTI =
  '660e8400-e29b-41d4-a716-446655440000';

export const DEFAULT_BLACKLISTED_TOKEN: BlacklistedToken = {
  _id: DEFAULT_BLACKLISTED_TOKEN_ID,
  jti: DEFAULT_BLACKLISTED_TOKEN_JTI,
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
  createdAt: new Date(),
};
