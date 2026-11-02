import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { generateTotp } from '../../../src/auth/mfa/totp';
import type { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { createApplicationAccess } from '../../helpers/application-access';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E MFA enrollment', () => {
  let app: Application;
  let application: ApplicationInterface;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createSession = async () => {
    const user = await fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('mfa'),
    });
    const access = await createApplicationAccess(user._id.toString());
    application = access.application;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(app).post('/auth/login').send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      });
      if (response.status === 200) {
        return { user, accessToken: response.body.accessToken as string };
      }
    }
    throw new Error('could not log in');
  };

  test('AC-1: enrolls, activates and returns recovery codes', async () => {
    const { user, accessToken } = await createSession();

    const enrollment = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', bearer(accessToken))
      .send({ password: DEFAULT_USER_PLAIN_PASSWORD })
      .expect(200);

    assert.match(enrollment.body.secret, /^[A-Z2-7]+$/);
    assert.ok(enrollment.body.otpauthUrl.startsWith('otpauth://totp/'));

    const activation = await request(app)
      .post('/auth/mfa/activate')
      .set('Authorization', bearer(accessToken))
      .send({ code: generateTotp(enrollment.body.secret) })
      .expect(200);

    assert.strictEqual(activation.body.recoveryCodes.length, 10);

    const stored = await fixture.findById<User>('User', user._id.toString());
    assert.strictEqual(stored?.mfaEnabled, true);

    await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', bearer(accessToken))
      .send({ password: DEFAULT_USER_PLAIN_PASSWORD })
      .expect(409);
  });

  test('requires enrollment before activation', async () => {
    const { accessToken } = await createSession();

    await request(app)
      .post('/auth/mfa/activate')
      .set('Authorization', bearer(accessToken))
      .send({ code: '123456' })
      .expect(400);
  });

  test('requires the correct password and authentication', async () => {
    const { accessToken } = await createSession();

    await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', bearer(accessToken))
      .send({ password: 'WrongPassword123!' })
      .expect(401);

    await request(app)
      .post('/auth/mfa/enroll')
      .send({ password: DEFAULT_USER_PLAIN_PASSWORD })
      .expect(401);
  });
});
