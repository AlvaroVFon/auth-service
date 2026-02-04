import { Code, CodeType } from '../../../src/auth/codes/code.interface';
import { DEFAULT_USER_ID } from './users.default';

export const DEFAULT_CODE: Code = {
  code: 'ABC123',
  expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
  used: false,
  userId: DEFAULT_USER_ID,
  type: CodeType.SIGNUP,
};
