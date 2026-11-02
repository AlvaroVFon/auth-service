import type { Application } from 'express';
import request from 'supertest';

import { generateTotp } from '../../src/auth/mfa/totp';

export interface EnrolledMfa {
  secret: string;
  recoveryCodes: string[];
  code: () => string;
}

export const enrollAndActivate = async (
  app: Application,
  accessToken: string,
  password: string,
): Promise<EnrolledMfa> => {
  const enrollment = await request(app)
    .post('/auth/mfa/enroll')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ password })
    .expect(200);

  const secret = enrollment.body.secret as string;

  const activation = await request(app)
    .post('/auth/mfa/activate')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ code: generateTotp(secret) })
    .expect(200);

  return {
    secret,
    recoveryCodes: activation.body.recoveryCodes as string[],
    code: () => generateTotp(secret),
  };
};
