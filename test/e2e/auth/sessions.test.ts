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
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  application: ApplicationInterface;
}

describe('E2E device sessions', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createUser = () =>
    fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('session'),
    });

  const login = async (
    user: User,
    application: ApplicationInterface,
    userAgent = 'Mozilla/5.0',
  ): Promise<LoginResult> => {
    const response = await request(app)
      .post('/auth/login')
      .set('User-Agent', userAgent)
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    return {
      accessToken: response.body.accessToken,
      refreshToken: response.body.refreshToken,
      application,
    };
  };

  const createSession = async (userAgent: string) => {
    const user = await createUser();
    const { application } = await createApplicationAccess(user._id.toString());
    const loginResult = await login(user, application, userAgent);

    return { user, application, login: loginResult };
  };

  test('AC-1: keeps simultaneous sessions from two devices', async () => {
    const user = await createUser();
    const { application } = await createApplicationAccess(user._id.toString());
    const desktop = await login(user, application, 'Desktop');
    const mobile = await login(user, application, 'Mobile');

    const sessions = await request(app)
      .get('/auth/sessions')
      .set('Authorization', bearer(mobile.accessToken))
      .expect(200);

    assert.strictEqual((sessions.body as unknown[]).length, 2);

    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: desktop.refreshToken })
      .expect(200);
    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: mobile.refreshToken })
      .expect(200);
  });

  test('AC-2: lists device, application, dates and activity', async () => {
    const { login: session, application } = await createSession('Desktop');

    const response = await request(app)
      .get('/auth/sessions')
      .set('Authorization', bearer(session.accessToken))
      .expect(200);

    assert.strictEqual((response.body as unknown[]).length, 1);
    const [listed] = response.body as Array<Record<string, unknown>>;

    assert.ok(listed?.id);
    assert.strictEqual(listed?.device, 'Desktop');
    assert.strictEqual(listed?.application, application.audience);
    assert.ok(listed?.createdAt);
    assert.ok(listed?.lastActivityAt);
    assert.ok(listed?.expiresAt);
  });

  test('AC-3: revoking one session keeps the other working', async () => {
    const user = await createUser();
    const { application } = await createApplicationAccess(user._id.toString());
    const desktop = await login(user, application, 'Desktop');
    const mobile = await login(user, application, 'Mobile');

    const sessions = await request(app)
      .get('/auth/sessions')
      .set('Authorization', bearer(desktop.accessToken))
      .expect(200);

    const desktopSession = (
      sessions.body as Array<{ id: string; device: string }>
    ).find((session) => session.device === 'Desktop');
    assert.ok(desktopSession);

    await request(app)
      .delete(`/auth/sessions/${desktopSession!.id}`)
      .set('Authorization', bearer(desktop.accessToken))
      .expect(204);

    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: desktop.refreshToken })
      .expect(401);

    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: mobile.refreshToken })
      .expect(200);

    const remaining = await request(app)
      .get('/auth/sessions')
      .set('Authorization', bearer(mobile.accessToken))
      .expect(200);

    assert.strictEqual((remaining.body as unknown[]).length, 1);
  });

  test('AC-4: revoking all sessions disables every refresh token', async () => {
    const user = await createUser();
    const { application } = await createApplicationAccess(user._id.toString());
    const desktop = await login(user, application, 'Desktop');
    const mobile = await login(user, application, 'Mobile');

    await request(app)
      .delete('/auth/sessions')
      .set('Authorization', bearer(desktop.accessToken))
      .expect(204);

    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: desktop.refreshToken })
      .expect(401);
    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: mobile.refreshToken })
      .expect(401);
  });

  test('does not revoke sessions of another user', async () => {
    const ownerSession = await createSession('Owner device');
    const otherSession = await createSession('Other device');

    const sessions = await request(app)
      .get('/auth/sessions')
      .set('Authorization', bearer(ownerSession.login.accessToken))
      .expect(200);

    const [ownerListed] = sessions.body as Array<{ id: string }>;

    await request(app)
      .delete(`/auth/sessions/${ownerListed!.id}`)
      .set('Authorization', bearer(otherSession.login.accessToken))
      .expect(404);
  });

  test('requires authentication to list or revoke sessions', async () => {
    await request(app).get('/auth/sessions').expect(401);
    await request(app).delete('/auth/sessions').expect(401);
    await request(app)
      .delete('/auth/sessions/6f1c2a2e-1111-4111-a111-111111111111')
      .expect(401);
  });
});
