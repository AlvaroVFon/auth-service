process.loadEnvFile('.env.test');
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import { getStringEnvVariable } from '../../../src/config/env.config';
import { User } from '../../../src/users/users.interface';
import { Roles } from '../../../src/common/enums/roles.enum';
import { Payload } from '../../../src/libs/jwt/jwt.interfaces';

export const DEFAULT_USER_ID = new Types.ObjectId('000000000000000000000001');
export const DEFAULT_ADMIN_ID = new Types.ObjectId('000000000000000000000002');

export const DEFAULT_USER_PLAIN_PASSWORD = 'StrongPassword123!';

const defaultUserPayload: Payload = {
  userId: DEFAULT_USER_ID.toString(),
  role: Roles.USER,
  type: 'access',
};

export const DEFAULT_USER_TOKEN = jwt.sign(
  defaultUserPayload,
  getStringEnvVariable('JWT_SECRET'),
  { expiresIn: '1h' },
);

export const DEFAULT_USER: User = {
  _id: DEFAULT_USER_ID,
  email: 'defaultuser@example.com',
  password: '$2b$10$njKm0/jBAa8VjVT4XXTbOOUqALanrKZLGrPaWXIACh6iZpoI1NUzm',
  role: Roles.USER,
  verified: true,
};

const defaultAdminPayload: Payload = {
  userId: DEFAULT_ADMIN_ID.toString(),
  role: Roles.ADMIN,
  type: 'access',
};

export const DEFAULT_ADMIN_TOKEN = jwt.sign(
  defaultAdminPayload,
  getStringEnvVariable('JWT_SECRET'),
  { expiresIn: '1h' },
);

export const DEFAULT_ADMIN: User = {
  _id: DEFAULT_ADMIN_ID,
  email: 'defaultadmin@example.com',
  password: '$2b$10$njKm0/jBAa8VjVT4XXTbOOUqALanrKZLGrPaWXIACh6iZpoI1NUzm',
  role: Roles.ADMIN,
  verified: true,
};

export const generateRandomEmail = (prefix: string) => {
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${prefix}${randomSuffix}@example.com`;
};
