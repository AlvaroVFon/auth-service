import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { Roles } from '../../../src/common/enums/roles.enum';
import { GrantRoles } from '../../../src/grants/grants.interface';
import type { User as UserInterface } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_ID,
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

describe('E2E owner MFA reset', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createUser = (overrides: Partial<UserInterface> = {}) =>
    fixture.create<UserInterface>(
      'User',
      UserFactory.generate({
        email: generateRandomEmail('mfa-reset+'),
        password: DEFAULT_USER.password,
        verified: true,
        ...overrides,
      }),
    );

  const createApplication = () =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(),
    );

  const grantViewer = (userId: Types.ObjectId, applicationId: Types.ObjectId) =>
    fixture.create(
      'Grant',
      GrantFactory.generate({
        userId,
        applicationId,
        role: GrantRoles.VIEWER,
      }),
    );

  const login = (email: string, application: string) =>
    request(app)
      .post('/auth/login')
      .send({
        email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application,
      })
      .expect(200);

  const enableMfa = (userId: Types.ObjectId) =>
    fixture.updateOne<UserInterface>('User', { _id: userId }, {
      $set: {
        mfaEnabled: true,
        mfaSecret: 'encrypted-secret',
        mfaPendingSecret: 'pending',
        mfaRecoveryCodes: ['hash'],
        mfaLastUsedStep: 10,
      },
    } as never);

  test('AC-1/AC-2/AC-3: clears MFA, revokes every session and audits the reset', async () => {
    const application = await createApplication();
    const user = await createUser();
    const other = await createUser();
    await grantViewer(user._id, application._id);
    await grantViewer(other._id, application._id);
    const firstLogin = await login(user.email, application.slug);
    const secondLogin = await login(user.email, application.slug);
    const otherLogin = await login(other.email, application.slug);
    await enableMfa(user._id);

    await request(app)
      .post(`/users/${user._id.toString()}/mfa/reset`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(204);

    const stored = await fixture.findById<UserInterface>(
      'User',
      user._id.toString(),
    );
    assert.strictEqual(stored?.mfaEnabled, false);
    assert.strictEqual(stored?.mfaSecret, undefined);
    assert.strictEqual(stored?.mfaPendingSecret, undefined);
    assert.deepStrictEqual(stored?.mfaRecoveryCodes, []);
    assert.strictEqual(stored?.mfaLastUsedStep, undefined);

    for (const refreshToken of [
      firstLogin.body.refreshToken as string,
      secondLogin.body.refreshToken as string,
    ]) {
      await request(app)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    }

    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: otherLogin.body.refreshToken as string })
      .expect(200);

    const events = await request(app)
      .get('/audit-events')
      .query({ event: 'user.mfa_reset' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    const items = (
      Array.isArray(events.body) ? events.body : events.body.items
    ) as Array<{ actorId?: string; targetUserId?: string }>;
    const event = items.at(-1);
    assert.strictEqual(event?.actorId, DEFAULT_OWNER_ID.toString());
    assert.strictEqual(event?.targetUserId, user._id.toString());
  });

  test('AC-4: rejects the owner, unknown ids and non-owner tokens', async () => {
    const owner = await createUser({
      email: generateRandomEmail('mfa-reset-owner+'),
      role: Roles.OWNER,
    });
    const user = await createUser();
    const appAdminToken = signTestAccessToken(
      new Types.ObjectId().toString(),
      Roles.USER,
    );

    for (const id of [owner._id.toString(), new Types.ObjectId().toString()]) {
      await request(app)
        .post(`/users/${id}/mfa/reset`)
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .expect(404);
    }

    await request(app)
      .post(`/users/${user._id.toString()}/mfa/reset`)
      .set('Authorization', bearer(appAdminToken))
      .expect(403);
  });
});
