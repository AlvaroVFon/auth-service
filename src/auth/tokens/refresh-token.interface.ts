import { Types } from 'mongoose';
import { TokenTypes } from '../../libs/jwt/token-types.enum';

export interface RefreshToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  token: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  replacedByToken?: string | null;
  type: TokenTypes.REFRESH;
}
