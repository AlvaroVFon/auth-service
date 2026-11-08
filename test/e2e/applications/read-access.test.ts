import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { Grant, GrantRoles } from '../../../src/grants/grants.interface';
import type { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_PLAIN_PASSWORD,
  DEFAULT_USER_TOKEN,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { GrantFactory } from '../../helpers/factories/grant.factory';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

interface LoginResponse {
  accessToken: string;
}

describe('E2E Applications read access', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createApplication = (overrides: Partial<ApplicationInterface> = {}) =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(overrides),
    );

  const createUser = () =>
    fixture.create<User>('User', {
      email: generateRandomEmail('read'),
    });

  const grantRole = (
    userId: string,
    applicationId: Types.ObjectId,
    role: GrantRoles,
  ) =>
    fixture.create<Grant>(
      'Grant',
      GrantFactory.generate({
        userId: new Types.ObjectId(userId),
        applicationId,
        role,
      }),
    );

  const login = (email: string, application: string) =>
    request(app).post('/auth/login').send({
      email,
      password: DEFAULT_USER_PLAIN_PASSWORD,
      application,
    });

  test('AC-1: the owner keeps reading any application, archived included', async () => {
    const active = await createApplication();
    const archived = await createApplication({ active: false });

    for (const application of [active, archived]) {
      const response = await request(app)
        .get(`/applications/${application._id.toString()}`)
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .expect(200);

      assert.strictEqual(response.body._id, application._id.toString());
      assert.strictEqual(response.body.slug, application.slug);
    }
  });

  test('AC-4: the app admin reads its own application and gets 404 for another', async () => {
    const own = await createApplication();
    const other = await createApplication();
    const appAdmin = await createUser();
    await grantRole(appAdmin._id.toString(), own._id, GrantRoles.ADMIN);

    const tokens = (await login(appAdmin.email, own.slug).expect(200))
      .body as LoginResponse;

    const ownResponse = await request(app)
      .get(`/applications/${own._id.toString()}`)
      .set('Authorization', bearer(tokens.accessToken))
      .expect(200);
    assert.strictEqual(ownResponse.body._id, own._id.toString());

    // A second application is indistinguishable from a missing one: the app
    // token's audience does not match and no grant exists there.
    await request(app)
      .get(`/applications/${other._id.toString()}`)
      .set('Authorization', bearer(tokens.accessToken))
      .expect(404);
  });

  test('AC-2: a missing application answers 404, identically to a foreign one', async () => {
    const missing = await request(app)
      .get(`/applications/${new Types.ObjectId().toString()}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(404);

    const application = await createApplication();
    const appAdmin = await createUser();
    await grantRole(appAdmin._id.toString(), application._id, GrantRoles.ADMIN);
    const tokens = (await login(appAdmin.email, application.slug).expect(200))
      .body as LoginResponse;

    const foreign = await request(app)
      .get(`/applications/${new Types.ObjectId().toString()}`)
      .set('Authorization', bearer(tokens.accessToken))
      .expect(404);

    assert.strictEqual(foreign.body.code, missing.body.code);
    assert.strictEqual(foreign.body.message, missing.body.message);
  });

  test('AC-3: viewer and editor grants do not authorize the read', async () => {
    for (const role of [GrantRoles.VIEWER, GrantRoles.EDITOR]) {
      const application = await createApplication();
      const user = await createUser();
      await grantRole(user._id.toString(), application._id, role);

      const tokens = (await login(user.email, application.slug).expect(200))
        .body as LoginResponse;

      await request(app)
        .get(`/applications/${application._id.toString()}`)
        .set('Authorization', bearer(tokens.accessToken))
        .expect(404);
    }
  });

  test('rejects a global non-owner token and an unauthenticated request', async () => {
    const application = await createApplication();
    const applicationId = application._id.toString();

    await request(app)
      .get(`/applications/${applicationId}`)
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .expect(404);

    await request(app).get(`/applications/${applicationId}`).expect(401);
  });

  test('an archived application is not readable by its app admin', async () => {
    const application = await createApplication();
    const appAdmin = await createUser();
    await grantRole(appAdmin._id.toString(), application._id, GrantRoles.ADMIN);
    const tokens = (await login(appAdmin.email, application.slug).expect(200))
      .body as LoginResponse;

    await request(app)
      .delete(`/applications/${application._id.toString()}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    await request(app)
      .get(`/applications/${application._id.toString()}`)
      .set('Authorization', bearer(tokens.accessToken))
      .expect(404);
  });

  test('rejects a malformed id with 400', async () => {
    await request(app)
      .get('/applications/bad-id')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(400);

    await request(app)
      .get('/applications/bad-id')
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .expect(400);
  });
});
