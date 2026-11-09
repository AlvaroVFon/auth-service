import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { Grant, GrantRoles } from '../../../src/grants/grants.interface';
import type { User as UserInterface } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER,
  DEFAULT_USER_PLAIN_PASSWORD,
  DEFAULT_USER_TOKEN,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { GrantFactory } from '../../helpers/factories/grant.factory';
import { UserFactory } from '../../helpers/factories/user.factory';
import { signTestAccessToken } from '../../helpers/tokens';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E application settings', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createApplication = (
    overrides: Partial<ApplicationInterface> = {},
  ): Promise<ApplicationInterface> =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(overrides),
    );

  const createUser = (overrides: Partial<UserInterface> = {}) =>
    fixture.create<UserInterface>(
      'User',
      UserFactory.generate({
        password: DEFAULT_USER.password,
        verified: true,
        ...overrides,
      }),
    );

  const grantAdmin = (userId: string, applicationId: string) =>
    fixture.create<Grant>(
      'Grant',
      GrantFactory.generate({
        userId: new Types.ObjectId(userId),
        applicationId: new Types.ObjectId(applicationId),
        role: GrantRoles.ADMIN,
      }),
    );

  test('AC-1: the owner reads the effective policy with provenance and the global reference', async () => {
    const application = await createApplication();

    const response = await request(app)
      .get(`/applications/${application._id.toString()}/settings`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.ok(response.body.settings);
    assert.ok(response.body.sources);
    assert.ok(response.body.global.settings);
    assert.ok(response.body.global.sources);

    for (const field of Object.keys(response.body.settings)) {
      assert.notStrictEqual(response.body.sources[field], 'application');
    }
    assert.deepStrictEqual(
      response.body.settings,
      response.body.global.settings,
    );
  });

  test('AC-1: an application override is marked as own and the global layer keeps the inherited value', async () => {
    const application = await createApplication({
      settings: { appName: 'Custom panel' },
    });

    const response = await request(app)
      .get(`/applications/${application._id.toString()}/settings`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(response.body.settings.appName, 'Custom panel');
    assert.strictEqual(response.body.sources.appName, 'application');
    assert.notStrictEqual(
      response.body.global.settings.appName,
      'Custom panel',
    );
  });

  test('AC-2: an app admin reads its application and gets 404 for another one', async () => {
    const applicationA = await createApplication();
    const applicationB = await createApplication();
    const admin = await createUser({ email: generateRandomEmail('app-admin') });
    await grantAdmin(admin._id.toString(), applicationA._id.toString());

    const login = await request(app)
      .post('/auth/login')
      .send({
        email: admin.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: applicationA.slug,
      })
      .expect(200);
    const token = login.body.accessToken as string;

    await request(app)
      .get(`/applications/${applicationA._id.toString()}/settings`)
      .set('Authorization', bearer(token))
      .expect(200);

    const foreign = await request(app)
      .get(`/applications/${applicationB._id.toString()}/settings`)
      .set('Authorization', bearer(token))
      .expect(404);
    assert.strictEqual(foreign.body.code, 'NOT_FOUND');
  });

  test('AC-3: unknown, malformed and inactive applications share the same 404', async () => {
    const inactive = await createApplication({ active: false });

    const responses = await Promise.all(
      [
        new Types.ObjectId().toString(),
        'not-an-object-id',
        inactive._id.toString(),
      ].map((id) =>
        request(app)
          .get(`/applications/${id}/settings`)
          .set('Authorization', bearer(DEFAULT_OWNER_TOKEN)),
      ),
    );

    for (const response of responses) {
      assert.strictEqual(response.status, 404);
      assert.strictEqual(response.body.code, 'NOT_FOUND');
      assert.strictEqual(response.body.message, 'Application not found');
    }
  });

  test('AC-4: a user without an admin grant gets 404 and no policy', async () => {
    const application = await createApplication();

    const response = await request(app)
      .get(`/applications/${application._id.toString()}/settings`)
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .expect(404);

    assert.strictEqual(response.body.code, 'NOT_FOUND');
    assert.strictEqual(response.body.settings, undefined);
  });

  test('AC-2: a viewer or editor grant cannot read the settings', async () => {
    const application = await createApplication();

    for (const role of [GrantRoles.VIEWER, GrantRoles.EDITOR]) {
      const user = await createUser();
      await fixture.create<Grant>(
        'Grant',
        GrantFactory.generate({
          userId: user._id,
          applicationId: application._id,
          role,
        }),
      );

      await request(app)
        .get(`/applications/${application._id.toString()}/settings`)
        .set('Authorization', bearer(signTestAccessToken(user._id.toString())))
        .expect(404);
    }
  });

  test('AC-4: an admin grant on another application does not authorize', async () => {
    const applicationA = await createApplication();
    const applicationB = await createApplication();
    const admin = await createUser();
    await grantAdmin(admin._id.toString(), applicationB._id.toString());

    await request(app)
      .get(`/applications/${applicationA._id.toString()}/settings`)
      .set('Authorization', bearer(signTestAccessToken(admin._id.toString())))
      .expect(404);
  });
});
