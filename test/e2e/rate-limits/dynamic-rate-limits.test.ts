import { Application } from 'express';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { GrantRoles } from '../../../src/grants/grants.interface';
import type { User as UserInterface } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import { DEFAULT_OWNER_TOKEN } from '../../fixtures/defaults';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { GrantFactory } from '../../helpers/factories/grant.factory';
import { UserFactory } from '../../helpers/factories/user.factory';
import { signTestAccessToken } from '../../helpers/tokens';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E dynamic rate limits', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createApplication = (
    settings?: ApplicationInterface['settings'],
  ): Promise<ApplicationInterface> =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(settings === undefined ? {} : { settings }),
    );

  const attemptLogin = (application: string) =>
    request(app).post('/auth/login').send({
      email: 'nobody@example.com',
      password: 'WrongPassword123!',
      application,
    });

  test('AC-1: a settings change applies to the next requests without a restart', async () => {
    await request(app)
      .patch('/settings')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ loginRateLimitMax: 2, loginRateLimitWindowMs: 60_000 })
      .expect(200);

    const application = await createApplication();

    await attemptLogin(application.slug).expect(401);
    await attemptLogin(application.slug).expect(401);
    const limited = await attemptLogin(application.slug).expect(429);
    assert.ok(limited.body.error);
  });

  test('AC-2: each application keeps its own login budget', async () => {
    const first = await createApplication({
      loginRateLimitMax: 2,
      loginRateLimitWindowMs: 60_000,
    });
    const second = await createApplication({
      loginRateLimitMax: 2,
      loginRateLimitWindowMs: 60_000,
    });

    await attemptLogin(first.slug).expect(401);
    await attemptLogin(first.slug).expect(401);
    await attemptLogin(first.slug).expect(429);

    // The exhausted budget of the first application does not leak.
    await attemptLogin(second.slug).expect(401);
  });

  test('AC-3: management endpoints use the per-application management budget', async () => {
    const application = await createApplication({
      managementRateLimitMax: 2,
      managementRateLimitWindowMs: 60_000,
    });
    const admin = await fixture.create<UserInterface>(
      'User',
      UserFactory.generate(),
    );
    await fixture.create(
      'Grant',
      GrantFactory.generate({
        userId: admin._id,
        applicationId: application._id,
        role: GrantRoles.ADMIN,
      }),
    );
    const token = signTestAccessToken(admin._id.toString());
    const path = `/applications/${application._id.toString()}/members`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app)
        .post(path)
        .set('Authorization', bearer(token))
        .send({ email: 'not-an-email', role: GrantRoles.VIEWER })
        .expect(400);
    }

    await request(app)
      .post(path)
      .set('Authorization', bearer(token))
      .send({ email: 'not-an-email', role: GrantRoles.VIEWER })
      .expect(429);
  });
});
