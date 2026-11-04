import { Application } from 'express';
import { Types } from 'mongoose';
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
import { signTestAccessToken } from '../../helpers/tokens';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E /auth/context', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createUser = (overrides: Partial<User> = {}) =>
    fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('context'),
      ...overrides,
    });

  const createApplication = () =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(),
    );

  const login = (email: string, application?: string) =>
    request(app)
      .post('/auth/login')
      .send({
        email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        ...(application === undefined ? {} : { application }),
      });

  const catalogEntry = (application: ApplicationInterface, role: string) => ({
    id: application._id.toString(),
    name: application.name,
    slug: application.slug,
    audience: application.audience,
    active: application.active,
    role,
  });

  const expectNoSensitiveFields = (body: Record<string, unknown>) => {
    const serialized = JSON.stringify(body);
    for (const field of [
      'mfaSecret',
      'mfaPendingSecret',
      'mfaRecoveryCodes',
      'password',
      'loginAttempts',
      'mfaFailedAttempts',
    ]) {
      assert.ok(
        !serialized.includes(field),
        `response must not include ${field}`,
      );
    }
  };

  test('AC-1: the owner receives the whole catalog with role owner', async () => {
    const owner = await createUser({ role: Roles.OWNER });
    const applicationA = await createApplication();
    const applicationB = await createApplication();

    const session = await login(owner.email).expect(200);

    const response = await request(app)
      .get('/auth/context')
      .set('Authorization', bearer(session.body.accessToken))
      .expect(200);

    assert.deepStrictEqual(response.body.user, {
      id: owner._id.toString(),
      email: owner.email,
      verified: true,
      mfaEnabled: false,
    });
    assert.strictEqual(response.body.role, Roles.OWNER);
    assert.strictEqual(response.body.applications.length, 2);
    for (const application of [applicationA, applicationB]) {
      assert.deepStrictEqual(
        response.body.applications.find(
          (entry: { id: string }) => entry.id === application._id.toString(),
        ),
        catalogEntry(application, Roles.OWNER),
      );
    }
    expectNoSensitiveFields(response.body);
  });

  test('AC-1: an owner with an application-scoped token sees the whole catalog', async () => {
    const owner = await createUser({ role: Roles.OWNER });
    const { application: scopedApplication } = await createApplicationAccess(
      owner._id.toString(),
      GrantRoles.ADMIN,
    );
    const otherApplication = await createApplication();

    // The session carries the grant role (admin), not the account role.
    const session = await login(owner.email, scopedApplication.slug).expect(
      200,
    );

    const response = await request(app)
      .get('/auth/context')
      .set('Authorization', bearer(session.body.accessToken))
      .expect(200);

    assert.strictEqual(response.body.role, Roles.OWNER);
    assert.strictEqual(response.body.applications.length, 2);
    for (const application of [scopedApplication, otherApplication]) {
      assert.deepStrictEqual(
        response.body.applications.find(
          (entry: { id: string }) => entry.id === application._id.toString(),
        ),
        catalogEntry(application, Roles.OWNER),
      );
    }
    assert.ok(
      response.body.applications.every(
        (entry: { role: string }) => entry.role === Roles.OWNER,
      ),
      'an owner must see every application with the owner role',
    );
    expectNoSensitiveFields(response.body);
  });

  test('AC-2: an app admin only receives the application of its grant', async () => {
    const user = await createUser();
    const { application } = await createApplicationAccess(
      user._id.toString(),
      GrantRoles.ADMIN,
    );
    const otherApplication = await createApplication();

    const session = await login(user.email, application.slug).expect(200);

    const response = await request(app)
      .get('/auth/context')
      .set('Authorization', bearer(session.body.accessToken))
      .expect(200);

    assert.strictEqual(response.body.user.id, user._id.toString());
    assert.strictEqual(response.body.role, Roles.USER);
    assert.deepStrictEqual(response.body.applications, [
      catalogEntry(application, GrantRoles.ADMIN),
    ]);
    assert.ok(
      !response.body.applications.some(
        (entry: { id: string }) => entry.id === otherApplication._id.toString(),
      ),
      'applications without a grant must not leak',
    );
  });

  test('AC-3: a user without grants receives an empty list and its token role', async () => {
    const user = await createUser();
    const token = signTestAccessToken(user._id.toString(), Roles.USER);

    const response = await request(app)
      .get('/auth/context')
      .set('Authorization', bearer(token))
      .expect(200);

    assert.strictEqual(response.body.role, Roles.USER);
    assert.deepStrictEqual(response.body.applications, []);
    assert.strictEqual(response.body.user.id, user._id.toString());
    assert.strictEqual(response.body.error, undefined);
  });

  test('AC-4: rejects a request without a token', async () => {
    const response = await request(app).get('/auth/context').expect(401);

    assert.strictEqual(response.body.user, undefined);
    assert.strictEqual(response.body.applications, undefined);
  });

  test('AC-4: rejects a revoked token after logout', async () => {
    const user = await createUser();
    const { application } = await createApplicationAccess(
      user._id.toString(),
      GrantRoles.VIEWER,
    );
    const session = await login(user.email, application.slug).expect(200);

    await request(app)
      .post('/auth/logout')
      .set('Authorization', bearer(session.body.accessToken))
      .expect(204);

    const response = await request(app)
      .get('/auth/context')
      .set('Authorization', bearer(session.body.accessToken))
      .expect(401);

    assert.strictEqual(response.body.user, undefined);
    assert.strictEqual(response.body.applications, undefined);
  });
});
