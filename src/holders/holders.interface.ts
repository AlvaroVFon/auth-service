import { Types } from 'mongoose';

export interface Holder {
  _id: Types.ObjectId;
  email: string;
  password: string;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Public holder projection: no password or internal fields. */
export interface HolderListItem {
  id: string;
  email: string;
  createdAt?: Date;
  expiresAt: Date;
}
