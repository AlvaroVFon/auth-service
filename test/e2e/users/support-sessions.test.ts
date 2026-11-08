import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import { Roles } from '../../../src/common/enums/roles.enum';
import { GrantRoles } from '../../../src/grants/grants.interface';
import type { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_PLAIN_PASSWORD,
  DEFAULT_USER_TOKEN,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { createApplicationAccess } from '../../helpers/application-access';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

interface SessionResponse {
  id: string;
  device: string | null;
  application: string | null;
  ipAddress: string | null;
  createdAt: string | null;
  lastActivityAt: string;
  expiresAt: string;
  [key: string]: unknown;
}

describe('E2E users support sessions', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createUser = (verified = true) =>
    fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('sessions'),
      ...(verified ? {} : { verified: false }),
    });

  const login = (email: string, application: string) =>
    request(app).post('/auth/login').send({
      email,
      password: DEFAULT_USER_PLAIN_PASSWORD,
      application,
    });

  const listSessions = (userId: string) =>
    request(app)
      .get(`/users/${userId}/sessions`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN));

  test('AC-1: lists the active sessions with the session view and no tokens', async () => {
    const user = await createUser();
    const first = await createApplicationAccess(user._id.toString());
    const second = await createApplicationAccess(
      user._id.toString(),
      GrantRoles.EDITOR,
    );

    await login(user.email, first.application.slug).expect(200);
    await login(user.email, second.application.slug).expect(200);

    const response = await listSessions(user._id.toString()).expect(200);
    const sessions = response.body as SessionResponse[];

    assert.strictEqual(sessions.length, 2);
    assert.deepStrictEqual(
      sessions
        .map((session) => session.application ?? '')
        .sort((a, b) => a.localeCompare(b)),
      [first.application.audience, second.application.audience].sort((a, b) =>
        a.localeCompare(b),
      ),
    );

    for (const session of sessions) {
      assert.ok(session.id);
      assert.ok(session.createdAt);
      assert.ok(session.lastActivityAt);
      assert.ok(session.expiresAt);
      assert.strictEqual('jti' in session, false);
      assert.strictEqual('refreshToken' in session, false);
      assert.strictEqual('accessToken' in session, false);
    }
  });

  test('AC-2: only the active session appears after a logout', async () => {
    const user = await createUser();
    const first = await createApplicationAccess(user._id.toString());
    const second = await createApplicationAccess(user._id.toString());

    const firstLogin = (
      await login(user.email, first.application.slug).expect(200)
    ).body as LoginResponse;
    await login(user.email, second.application.slug).expect(200);

    await request(app)
      .post('/auth/logout')
      .set('Authorization', bearer(firstLogin.accessToken))
      .expect(204);

    const response = await listSessions(user._id.toString()).expect(200);
    const sessions = response.body as SessionResponse[];

    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0]?.application, second.application.audience);
  });

  test('isolates the listing to the requested user', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const accessA = await createApplicationAccess(userA._id.toString());
    const accessB = await createApplicationAccess(userB._id.toString());

    await login(userA.email, accessA.application.slug).expect(200);
    await login(userB.email, accessB.application.slug).expect(200);

    const response = await listSessions(userA._id.toString()).expect(200);
    const sessions = response.body as SessionResponse[];

    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0]?.application, accessA.application.audience);
  });

  test('AC-3: the owner, an unknown id and a malformed id are rejected', async () => {
    const owner = await fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('sessions-owner'),
      role: Roles.OWNER,
      verified: true,
    });

    await listSessions(owner._id.toString()).expect(404);
    await listSessions(new Types.ObjectId().toString()).expect(404);

    const malformed = await listSessions('bad-id').expect(400);
    assert.strictEqual(malformed.body.code, 'INVALID_ARGUMENT');
    assert.strictEqual(malformed.body.password, undefined);
  });

  test('AC-4: only a global owner can list sessions', async () => {
    const user = await createUser();
    const { application } = await createApplicationAccess(
      user._id.toString(),
      GrantRoles.ADMIN,
    );
    const appAdmin = await login(user.email, application.slug).expect(200);
    const appToken = (appAdmin.body as LoginResponse).accessToken;

    // An application token carries an audience, so it fails authentication on
    // the owner surface before the role guard.
    await request(app)
      .get(`/users/${user._id.toString()}/sessions`)
      .set('Authorization', bearer(appToken))
      .expect(401);

    await request(app)
      .get(`/users/${user._id.toString()}/sessions`)
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .expect(403);

    await request(app)
      .get(`/users/${user._id.toString()}/sessions`)
      .expect(401);
  });
});
