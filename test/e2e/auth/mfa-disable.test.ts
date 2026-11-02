import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import type { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { createApplicationAccess } from '../../helpers/application-access';
import { enrollAndActivate, EnrolledMfa } from '../../helpers/mfa';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E MFA disable', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createMfaUser = async (): Promise<{
    user: User;
    application: ApplicationInterface;
    accessToken: string;
    mfa: EnrolledMfa;
  }> => {
    const user = await fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('mfa-disable'),
    });
    const { application } = await createApplicationAccess(user._id.toString());
    const login = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);
    const mfa = await enrollAndActivate(
      app,
      login.body.accessToken,
      DEFAULT_USER_PLAIN_PASSWORD,
    );

    return {
      user,
      application,
      accessToken: login.body.accessToken as string,
      mfa,
    };
  };

  test('AC-5: disables MFA with password and code', async () => {
    const { user, application, accessToken, mfa } = await createMfaUser();

    await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', bearer(accessToken))
      .send({ password: DEFAULT_USER_PLAIN_PASSWORD, code: mfa.code() })
      .expect(204);

    const login = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    assert.strictEqual(login.body.mfaRequired, undefined);
    assert.ok(login.body.accessToken);
  });

  test('keeps MFA enabled on a wrong password or code', async () => {
    const { application, accessToken, user } = await createMfaUser();

    await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', bearer(accessToken))
      .send({
        password: 'WrongPassword123!',
        code: '000000',
      })
      .expect(401);

    await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', bearer(accessToken))
      .send({
        password: DEFAULT_USER_PLAIN_PASSWORD,
        code: '000000',
      })
      .expect(401);

    const login = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    assert.strictEqual(login.body.mfaRequired, true);
  });

  test('accepts a recovery code to disable MFA', async () => {
    const { accessToken, mfa } = await createMfaUser();

    await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', bearer(accessToken))
      .send({
        password: DEFAULT_USER_PLAIN_PASSWORD,
        code: mfa.recoveryCodes[0]!,
      })
      .expect(204);
  });

  test('rejects disabling when MFA is not enabled or unauthenticated', async () => {
    const user = await fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('mfa-off'),
    });
    const { application } = await createApplicationAccess(user._id.toString());
    const login = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', bearer(login.body.accessToken))
      .send({
        password: DEFAULT_USER_PLAIN_PASSWORD,
        code: '123456',
      })
      .expect(409);

    await request(app)
      .post('/auth/mfa/disable')
      .send({
        password: DEFAULT_USER_PLAIN_PASSWORD,
        code: '123456',
      })
      .expect(401);
  });
});
