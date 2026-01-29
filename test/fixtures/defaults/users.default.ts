import { Types } from 'mongoose';

export const DEFAULT_USER_ID = new Types.ObjectId('000000000000000000000001');

export const DEFAULT_USER = {
  _id: DEFAULT_USER_ID,
  email: 'defaultuser@example.com',
};
