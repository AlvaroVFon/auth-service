import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';

export const DEFAULT_USER_ID = new Types.ObjectId('000000000000000000000001');

export const DEFAULT_ACCESS_TOKEN = jwt.sign(
  { userId: DEFAULT_USER_ID.toString(), type: 'access' },
  process.env.JWT_SECRET || 'test-secret-fallback',
  { expiresIn: '100y' },
);

export const DEFAULT_USER = {
  _id: DEFAULT_USER_ID,
  email: 'defaultuser@example.com',
  password: '$2b$10$DOgX16YaMx3WlA8/4v5gH.qMMDUPxnsbFzl5mSRmT6Gj3.cwCxQjy',
};

export const generateRandomEmail = (prefix: string) => {
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${prefix}${randomSuffix}@example.com`;
};
