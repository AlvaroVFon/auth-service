import { Application } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import request from 'supertest';

import { Roles } from '../../../src/common/enums/roles.enum';
import { GrantRoles } from '../../../src/grants/grants.interface';
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
  audience: string;
}

describe('E2E /auth/me and /auth/introspect', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createUser = (overrides: Partial<User> = {}) =>
    fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('me'),
      ...overrides,
    });

  const loginWithApplication = async (
    user: User,
    role: GrantRoles = GrantRoles.VIEWER,
  ): Promise<LoginResult> => {
    const { application } = await createApplicationAccess(
      user._id.toString(),
      role,
    );

    const response = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    return {
      accessToken: response.body.accessToken,
      refreshToken: response.body.refreshToken,
      audience: application.audience,
    };
  };

  test('AC-1: returns identity, application, role and expiration', async () => {
    const user = await createUser();
    const login = await loginWithApplication(user, GrantRoles.EDITOR);

    const response = await request(app)
      .get('/auth/me')
      .set('Authorization', bearer(login.accessToken))
      .expect(200);

    const claims = jwt.decode(login.accessToken) as { exp: number };

    assert.strictEqual(response.body.id, user._id.toString());
    assert.strictEqual(response.body.email, user.email);
    assert.strictEqual(response.body.application, login.audience);
    assert.strictEqual(response.body.role, GrantRoles.EDITOR);
    assert.strictEqual(
      new Date(response.body.expiresAt).getTime(),
      claims.exp * 1000,
    );
  });

  test('AC-2: rejects a revoked token with 401', async () => {
    const user = await createUser();
    const login = await loginWithApplication(user);

    await request(app)
      .post('/auth/logout')
      .set('Authorization', bearer(login.accessToken))
      .expect(204);

    await request(app)
      .get('/auth/me')
      .set('Authorization', bearer(login.accessToken))
      .expect(401);
  });

  test('returns a null application for the global owner', async () => {
    const owner = await createUser({ role: Roles.OWNER });

    const login = await request(app)
      .post('/auth/login')
      .send({
        email: owner.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
      })
      .expect(200);

    const response = await request(app)
      .get('/auth/me')
      .set('Authorization', bearer(login.body.accessToken))
      .expect(200);

    assert.strictEqual(response.body.application, null);
    assert.strictEqual(response.body.role, Roles.OWNER);
  });

  test('AC-3: introspects an active token with app, role and expiration', async () => {
    const user = await createUser();
    const login = await loginWithApplication(user, GrantRoles.ADMIN);

    const response = await request(app)
      .post('/auth/introspect')
      .set('Authorization', bearer(login.accessToken))
      .send({ token: login.accessToken })
      .expect(200);

    assert.strictEqual(response.body.active, true);
    assert.strictEqual(response.body.id, user._id.toString());
    assert.strictEqual(response.body.application, login.audience);
    assert.strictEqual(response.body.role, GrantRoles.ADMIN);
    assert.ok(response.body.expiresAt);
  });

  test('AC-4: introspects a revoked token as inactive', async () => {
    const user = await createUser();
    const revoked = await loginWithApplication(user);

    await request(app)
      .post('/auth/logout')
      .set('Authorization', bearer(revoked.accessToken))
      .expect(204);

    const fresh = await loginWithApplication(user);

    const response = await request(app)
      .post('/auth/introspect')
      .set('Authorization', bearer(fresh.accessToken))
      .send({ token: revoked.accessToken })
      .expect(200);

    assert.deepStrictEqual(response.body, { active: false });
  });

  test('AC-4: introspects an unknown token as inactive', async () => {
    const user = await createUser();
    const login = await loginWithApplication(user);

    const response = await request(app)
      .post('/auth/introspect')
      .set('Authorization', bearer(login.accessToken))
      .send({ token: 'not-a-token' })
      .expect(200);

    assert.deepStrictEqual(response.body, { active: false });
  });

  test('AC-4: introspects a token from another application as inactive', async () => {
    const user = await createUser();
    const appA = await loginWithApplication(user);
    const appB = await loginWithApplication(user);

    const response = await request(app)
      .post('/auth/introspect')
      .set('Authorization', bearer(appB.accessToken))
      .send({ token: appA.accessToken })
      .expect(200);

    assert.deepStrictEqual(response.body, { active: false });
  });

  test('AC-4: introspects a token from another user as inactive', async () => {
    const owner = await createUser();
    const other = await createUser();
    const ownerLogin = await loginWithApplication(owner);
    const otherLogin = await loginWithApplication(other);

    const response = await request(app)
      .post('/auth/introspect')
      .set('Authorization', bearer(ownerLogin.accessToken))
      .send({ token: otherLogin.accessToken })
      .expect(200);

    assert.deepStrictEqual(response.body, { active: false });
  });

  test('requires a token in the introspection body', async () => {
    const user = await createUser();
    const login = await loginWithApplication(user);

    const response = await request(app)
      .post('/auth/introspect')
      .set('Authorization', bearer(login.accessToken))
      .send({ token: '' })
      .expect(400);

    assert.strictEqual(response.body.message, 'token is required');
  });

  test('requires authentication on both endpoints', async () => {
    await request(app).get('/auth/me').expect(401);
    await request(app)
      .post('/auth/introspect')
      .send({ token: 'any' })
      .expect(401);
  });
});
