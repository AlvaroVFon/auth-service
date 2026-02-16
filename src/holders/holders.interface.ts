import { Types } from 'mongoose';

export interface Holder {
  _id: Types.ObjectId;
  email: string;
  password: string;
  expiresAt: Date;
}
