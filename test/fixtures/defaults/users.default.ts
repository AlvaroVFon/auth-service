import { Types } from 'mongoose';

export const DEFAULT_USER_ID = new Types.ObjectId('000000000000000000000001');

export const DEFAULT_USER = {
  _id: DEFAULT_USER_ID,
  email: 'defaultuser@example.com',
  password: '$2b$10$abcdefghijklmnopqrstuv',
};

export const generateRandomEmail = (prefix: string) => {
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${prefix}${randomSuffix}@example.com`;
};
