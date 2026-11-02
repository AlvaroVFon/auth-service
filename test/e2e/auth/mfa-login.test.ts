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

describe('E2E MFA login', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createMfaUser = async (): Promise<{
    user: User;
    application: ApplicationInterface;
    mfa: EnrolledMfa;
  }> => {
    const user = await fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('mfa-login'),
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

    return { user, application, mfa };
  };

  const challenge = async (
    user: User,
    application: ApplicationInterface,
  ): Promise<string> => {
    const response = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    assert.strictEqual(response.body.mfaRequired, true);
    assert.strictEqual(response.body.accessToken, undefined);
    assert.strictEqual(response.body.refreshToken, undefined);
    assert.ok(response.body.challengeToken);

    return response.body.challengeToken as string;
  };

  test('AC-2: requires the second factor before issuing tokens', async () => {
    const { user, application, mfa } = await createMfaUser();
    const challengeToken = await challenge(user, application);

    await request(app)
      .get('/auth/me')
      .set('Authorization', bearer(challengeToken))
      .expect(401);

    const verified = await request(app)
      .post('/auth/mfa/verify')
      .send({ mfaToken: challengeToken, code: mfa.code() })
      .expect(200);

    assert.ok(verified.body.accessToken);
    assert.ok(verified.body.refreshToken);

    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', bearer(verified.body.accessToken))
      .expect(200);

    assert.strictEqual(me.body.application, application.audience);
  });

  test('AC-5: rejects a replayed TOTP code', async () => {
    const { user, application, mfa } = await createMfaUser();
    const challengeToken = await challenge(user, application);
    const code = mfa.code();

    await request(app)
      .post('/auth/mfa/verify')
      .send({ mfaToken: challengeToken, code })
      .expect(200);

    await request(app)
      .post('/auth/mfa/verify')
      .send({ mfaToken: challengeToken, code })
      .expect(401);
  });

  test('AC-3: locks after repeated invalid codes', async () => {
    const { user, application } = await createMfaUser();
    const challengeToken = await challenge(user, application);

    for (let attempt = 0; attempt < 4; attempt++) {
      await request(app)
        .post('/auth/mfa/verify')
        .send({ mfaToken: challengeToken, code: '000000' })
        .expect(401);
    }

    const locked = await request(app)
      .post('/auth/mfa/verify')
      .send({ mfaToken: challengeToken, code: '000000' })
      .expect(423);

    assert.strictEqual(locked.body.code, 'ACCOUNT_LOCKED');

    await request(app)
      .post('/auth/mfa/verify')
      .send({ mfaToken: challengeToken, code: '000000' })
      .expect(423);
  });

  test('AC-4: accepts a recovery code only once', async () => {
    const { user, application, mfa } = await createMfaUser();
    const challengeToken = await challenge(user, application);
    const recoveryCode = mfa.recoveryCodes[0]!;

    await request(app)
      .post('/auth/mfa/verify')
      .send({ mfaToken: challengeToken, code: recoveryCode })
      .expect(200);

    await request(app)
      .post('/auth/mfa/verify')
      .send({ mfaToken: challengeToken, code: recoveryCode })
      .expect(401);
  });

  test('rejects an invalid challenge', async () => {
    await request(app)
      .post('/auth/mfa/verify')
      .send({ mfaToken: 'not-a-token', code: '123456' })
      .expect(401);

    await request(app)
      .post('/auth/mfa/verify')
      .send({ code: '123456' })
      .expect(400);
  });
});
