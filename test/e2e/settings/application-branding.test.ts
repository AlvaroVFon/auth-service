import { Application } from 'express';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { GrantRoles } from '../../../src/grants/grants.interface';
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
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E application branding from persisted settings', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createApplication = () =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate({
        settings: {
          appName: 'Custom Panel',
          invitationTtlMs: 120_000,
        },
      }),
    );

  const createGrantedUser = async (application: ApplicationInterface) => {
    const user = await fixture.create(
      'User',
      UserFactory.generate({
        email: generateRandomEmail('branded+'),
        password: DEFAULT_USER.password,
        verified: true,
      }),
    );
    await fixture.create(
      'Grant',
      GrantFactory.generate({
        userId: user._id,
        applicationId: application._id,
        role: GrantRoles.VIEWER,
      }),
    );

    return user;
  };

  test('applies the persisted invitation TTL to the effective expiry', async () => {
    const application = await createApplication();
    const before = Date.now();

    const response = await request(app)
      .post(`/applications/${application._id.toString()}/invitations`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({
        email: generateRandomEmail('invite-ttl+'),
        role: GrantRoles.VIEWER,
      })
      .expect(201);

    const ttl = new Date(response.body.expiresAt).getTime() - before;
    assert.ok(ttl >= 119_000 && ttl <= 121_000);
  });

  test('brands the authenticator issuer with the persisted application name', async () => {
    const application = await createApplication();
    const user = await createGrantedUser(application);

    const login = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    const enrollment = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', bearer(login.body.accessToken as string))
      .send({ password: DEFAULT_USER_PLAIN_PASSWORD })
      .expect(200);

    assert.match(enrollment.body.otpauthUrl, /issuer=Custom%20Panel/);
  });
});
