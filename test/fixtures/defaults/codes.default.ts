import { Types } from 'mongoose';
import { Code, CodeType } from '../../../src/auth/codes/code.interface';
import { DEFAULT_USER_ID } from './users.default';

const DEFAULT_CODE_ID = new Types.ObjectId('64b7f8f4c2a1f2e5d6b8c9a0');

export const DEFAULT_CODE: Code = {
  _id: DEFAULT_CODE_ID,
  code: 'ABC123',
  expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
  used: false,
  userId: DEFAULT_USER_ID,
  type: CodeType.SIGNUP,
};
