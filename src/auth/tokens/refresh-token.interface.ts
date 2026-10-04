import { Types } from 'mongoose';

import { TokenTypes } from '../../libs/jwt';

export interface RefreshToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  jti: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByJti: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  type: TokenTypes.REFRESH;
}
