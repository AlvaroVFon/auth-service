process.loadEnvFile('.env.test');
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import { getStringEnvVariable } from '../../../src/config/env.config';

export const DEFAULT_USER_ID = new Types.ObjectId('000000000000000000000001');

export const DEFAULT_USER_TOKEN = jwt.sign(
  { userId: DEFAULT_USER_ID.toString() },
  getStringEnvVariable('JWT_SECRET'),
  { expiresIn: '1h' },
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
