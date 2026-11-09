import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { GrantRoles } from '../../../src/grants/grants.interface';
import type { User as UserInterface } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER,
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { GrantFactory } from '../../helpers/factories/grant.factory';
import { UserFactory } from '../../helpers/factories/user.factory';
import { signTestAccessToken } from '../../helpers/tokens';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E user security overview', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createApplication = () =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(),
    );

  const createUser = (overrides: Record<string, unknown> = {}) =>
    fixture.create<UserInterface>(
      'User',
      UserFactory.generate({
        email: generateRandomEmail('security+'),
        password: DEFAULT_USER.password,
        verified: true,
        ...overrides,
      }),
    );

  const grant = (
    userId: string,
    applicationId: string,
    role = GrantRoles.VIEWER,
  ) =>
    fixture.create(
      'Grant',
      GrantFactory.generate({
        userId: new Types.ObjectId(userId),
        applicationId: new Types.ObjectId(applicationId),
        role,
      }),
    );

  test('AC-1/AC-2/AC-4: returns counters, last login and no secrets', async () => {
    const application = await createApplication();
    const user = await createUser();
    await grant(user._id.toString(), application._id.toString());
    const login = () =>
      request(app)
        .post('/auth/login')
        .send({
          email: user.email,
          password: DEFAULT_USER_PLAIN_PASSWORD,
          application: application.slug,
        })
        .expect(200);
    await login();
    await login();
    await fixture.updateOne<UserInterface>('User', { _id: user._id }, {
      $set: {
        mfaEnabled: true,
        mfaSecret: 'encrypted-secret',
        mfaRecoveryCodes: ['hash'],
        lockoutUntil: new Date(Date.now() + 60_000),
        mfaLockoutUntil: new Date(Date.now() + 60_000),
        loginAttempts: 3,
      },
    } as never);

    const sessions = await request(app)
      .get(`/users/${user._id.toString()}/sessions`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    const latest = Math.max(
      ...(sessions.body as Array<{ lastActivityAt: string }>).map((session) =>
        new Date(session.lastActivityAt).getTime(),
      ),
    );

    const response = await request(app)
      .get(`/users/${user._id.toString()}/security`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(response.body.verified, true);
    assert.strictEqual(response.body.mfaEnabled, true);
    assert.strictEqual(response.body.loginAttempts, 3);
    assert.ok(response.body.lockoutUntil);
    assert.ok(response.body.mfaLockoutUntil);
    assert.strictEqual(response.body.activeSessions, 2);
    assert.strictEqual(new Date(response.body.lastLoginAt).getTime(), latest);
    const serialized = JSON.stringify(response.body);
    for (const secret of [
      'mfaSecret',
      'mfaPendingSecret',
      'mfaRecoveryCodes',
      'password',
      'hash',
    ]) {
      assert.strictEqual(serialized.includes(secret), false);
    }
  });

  test('AC-3: a user without sessions reports null and zero', async () => {
    const user = await createUser();

    const response = await request(app)
      .get(`/users/${user._id.toString()}/security`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(response.body.lastLoginAt, null);
    assert.strictEqual(response.body.activeSessions, 0);
  });

  test('AC-5: the owner, unknown ids and app admins get 404 or 403', async () => {
    const owner = await createUser({ role: 'owner' as never });

    await request(app)
      .get(`/users/${owner._id.toString()}/security`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(404);
    await request(app)
      .get(`/users/${new Types.ObjectId().toString()}/security`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(404);
    await request(app)
      .get(`/users/${owner._id.toString()}/security`)
      .set(
        'Authorization',
        bearer(signTestAccessToken(new Types.ObjectId().toString())),
      )
      .expect(403);
  });
});
