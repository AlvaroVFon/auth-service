import { Types } from 'mongoose';
import { RefreshToken } from '../../../src/auth/tokens/refresh-token.interface';
import { DEFAULT_USER_ID } from './users.default';
import { TokenTypes } from '../../../src/libs/jwt/token-types.enum';

export const DEFAULT_REFRESH_TOKEN_ID = new Types.ObjectId(
  '64b7f8f4c2a1f2e5d6b8c9a1',
);

export const DEFAULT_REFRESH_TOKEN_JTI = '550e8400-e29b-41d4-a716-446655440000';

export const DEFAULT_REFRESH_TOKEN: RefreshToken = {
  _id: DEFAULT_REFRESH_TOKEN_ID,
  userId: DEFAULT_USER_ID,
  jti: DEFAULT_REFRESH_TOKEN_JTI,
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
  revokedAt: null,
  replacedByJti: null,
  type: TokenTypes.REFRESH,
};
