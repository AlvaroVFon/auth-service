import { Types } from 'mongoose';

export interface BlacklistedToken {
  _id: Types.ObjectId;
  jti: string;
  expiresAt: Date;
  createdAt: Date;
}
