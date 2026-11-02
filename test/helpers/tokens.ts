import { randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { Roles } from '../../src/common/enums/roles.enum';
import { getStringEnvVariable } from '../../src/config/env.config';
import { Payload } from '../../src/libs/jwt/jwt.interfaces';
import { TokenTypes } from '../../src/libs/jwt/token-types.enum';

export const signTestAccessToken = (
  userId: string,
  role: Roles = Roles.USER,
): string => {
  const payload: Payload = {
    userId,
    role,
    type: TokenTypes.ACCESS,
    jti: randomUUID(),
  };

  return jwt.sign(payload, getStringEnvVariable('JWT_SECRET'), {
    expiresIn: '1h',
  });
};
