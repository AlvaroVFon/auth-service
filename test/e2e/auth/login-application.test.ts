import { Application } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { Roles } from '../../../src/common/enums/roles.enum';
import { GrantRoles } from '../../../src/grants/grants.interface';
import type { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { createApplicationAccess } from '../../helpers/application-access';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { getTestAppInstance } from '../../utils/app';

interface TokenClaims {
  aud?: string;
  role?: string;
  type?: string;
}

const decode = (token: string): TokenClaims => jwt.decode(token) as TokenClaims;

describe('E2E login against an application', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createUser = (overrides: Partial<User> = {}) =>
    fixture.create<User>('User', overrides);

  const createApplication = () =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(),
    );

  test('AC-1: logs in with the app audience and grant role', async () => {
    const user = await createUser();
    const { application } = await createApplicationAccess(
      user._id.toString(),
      GrantRoles.EDITOR,
    );

    const response = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    const access = decode(response.body.accessToken);
    const refresh = decode(response.body.refreshToken);

    assert.strictEqual(access.aud, application.audience);
    assert.strictEqual(access.role, GrantRoles.EDITOR);
    assert.strictEqual(refresh.aud, application.audience);
    assert.strictEqual(refresh.role, GrantRoles.EDITOR);
  });

  test('accepts the audience as the application identifier', async () => {
    const user = await createUser();
    const { application } = await createApplicationAccess(user._id.toString());

    const response = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.audience,
      })
      .expect(200);

    assert.strictEqual(
      decode(response.body.accessToken).aud,
      application.audience,
    );
  });

  test('AC-2: rejects a user without a grant and issues no tokens', async () => {
    const user = await createUser();
    const application = await createApplication();

    const response = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(403);

    assert.strictEqual(
      response.body.message,
      'User has no access to this application',
    );
    assert.strictEqual(response.body.accessToken, undefined);
    assert.strictEqual(response.body.refreshToken, undefined);
  });

  test('AC-3: issues the role of each application', async () => {
    const user = await createUser();
    const appA = await createApplicationAccess(
      user._id.toString(),
      GrantRoles.VIEWER,
    );
    const appB = await createApplicationAccess(
      user._id.toString(),
      GrantRoles.ADMIN,
    );

    const tokensA = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: appA.application.slug,
      })
      .expect(200);
    const tokensB = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: appB.application.slug,
      })
      .expect(200);

    assert.strictEqual(
      decode(tokensA.body.accessToken).role,
      GrantRoles.VIEWER,
    );
    assert.strictEqual(decode(tokensB.body.accessToken).role, GrantRoles.ADMIN);
  });

  test('AC-4: keeps a generic 401 for invalid credentials', async () => {
    const user = await createUser();
    const { application } = await createApplicationAccess(user._id.toString());

    const response = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: 'WrongPassword123!',
        application: application.slug,
      })
      .expect(401);

    assert.strictEqual(response.body.message, 'Invalid email or password');
  });

  test('AC-4: does not reveal whether an account exists', async () => {
    const application = await createApplication();

    const response = await request(app)
      .post('/auth/login')
      .send({
        email: generateRandomEmail('missing-user'),
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(401);

    assert.strictEqual(response.body.message, 'Invalid email or password');
  });

  test('rejects an unknown application without tokens', async () => {
    const user = await createUser();

    const response = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: 'unknown-application',
      })
      .expect(403);

    assert.strictEqual(response.body.accessToken, undefined);
  });

  test('rejects an inactive application', async () => {
    const user = await createUser();
    const { application } = await createApplicationAccess(user._id.toString());
    await fixture.updateOne<ApplicationInterface>(
      'Application',
      { _id: application._id },
      { active: false },
    );

    await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(403);
  });

  test('rejects a non-string application instead of dropping it', async () => {
    const user = await createUser();

    for (const application of [123, ['app']]) {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: user.email,
          password: DEFAULT_USER_PLAIN_PASSWORD,
          application,
        })
        .expect(400);

      assert.strictEqual(response.body.message, 'application must be a string');
    }
  });

  test('lets the owner log in without an application', async () => {
    const owner = await createUser({ role: Roles.OWNER });

    const response = await request(app)
      .post('/auth/login')
      .send({
        email: owner.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
      })
      .expect(200);

    const access = decode(response.body.accessToken);

    assert.strictEqual(access.aud, undefined);
    assert.strictEqual(access.role, Roles.OWNER);
  });

  test('rejects a regular user without an application', async () => {
    const user = await createUser();

    await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
      })
      .expect(403);
  });
});
