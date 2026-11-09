import { Types } from 'mongoose';

import { TokenTypes } from '../../libs/jwt';

export interface RefreshToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  sessionId?: string;
  jti: string;
  audience: string | null;
  sessionStartedAt?: Date;
  expiresAt: Date;
  lastActivityAt?: Date;
  revokedAt: Date | null;
  /** Internal marker of the bulk revocation that closed this token. */
  revocationBatchId?: string;
  replacedByJti: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  type: TokenTypes.REFRESH;
  createdAt?: Date;
  updatedAt?: Date;
}
