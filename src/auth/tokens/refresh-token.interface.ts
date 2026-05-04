import { Types } from 'mongoose';
import { TokenTypes } from '../../libs/jwt/token-types.enum';

export interface RefreshToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  jti: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByJti: string | null;
  type: TokenTypes.REFRESH;
}
