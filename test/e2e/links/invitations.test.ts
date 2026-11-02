import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { Grant, GrantRoles } from '../../../src/grants/grants.interface';
import type { OneTimeLink } from '../../../src/links/link.interface';
import type { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { GrantFactory } from '../../helpers/factories/grant.factory';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;
const PASSWORD = DEFAULT_USER_PLAIN_PASSWORD;

const tokenFromLink = (link: string): string =>
  new URL(link).searchParams.get('token') as string;

describe('E2E invitations', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createApplication = () =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(),
    );

  const createUser = (overrides: Partial<User> = {}) =>
    fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('invite'),
      ...overrides,
    });

  const loginToApplication = (email: string, applicationSlug: string) =>
    request(app).post('/auth/login').send({
      email,
      password: PASSWORD,
      application: applicationSlug,
    });

  test('AC-1: the owner creates a single-use invitation link', async () => {
    const application = await createApplication();
    const email = generateRandomEmail('guest');

    const response = await request(app)
      .post(`/applications/${application._id.toString()}/invitations`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ email, role: GrantRoles.EDITOR })
      .expect(201);

    assert.match(response.body.link, /\/invitations\/accept\?token=.+/);
    assert.strictEqual(response.body.email, email.toLowerCase());
    assert.strictEqual(response.body.applicationId, application._id.toString());
    assert.strictEqual(response.body.role, GrantRoles.EDITOR);
    assert.ok(response.body.expiresAt);

    await loginToApplication(email, application.slug).expect(401);
  });

  test('lets an app admin create an invitation for its app', async () => {
    const application = await createApplication();
    const admin = await createUser();
    await fixture.create<Grant>(
      'Grant',
      GrantFactory.generate({
        userId: admin._id,
        applicationId: application._id,
        role: GrantRoles.ADMIN,
      }),
    );
    const login = await loginToApplication(
      admin.email,
      application.slug,
    ).expect(200);

    await request(app)
      .post(`/applications/${application._id.toString()}/invitations`)
      .set('Authorization', bearer(login.body.accessToken))
      .send({ email: generateRandomEmail('guest'), role: GrantRoles.VIEWER })
      .expect(201);
  });

  test('forbids a global non-owner and an app viewer', async () => {
    const application = await createApplication();
    const viewer = await createUser();
    await fixture.create<Grant>(
      'Grant',
      GrantFactory.generate({
        userId: viewer._id,
        applicationId: application._id,
        role: GrantRoles.VIEWER,
      }),
    );
    const login = await loginToApplication(
      viewer.email,
      application.slug,
    ).expect(200);

    await request(app)
      .post(`/applications/${application._id.toString()}/invitations`)
      .set('Authorization', bearer(login.body.accessToken))
      .send({ email: generateRandomEmail('guest'), role: GrantRoles.VIEWER })
      .expect(403);

    await request(app)
      .post(`/applications/${application._id.toString()}/invitations`)
      .send({ email: generateRandomEmail('guest'), role: GrantRoles.VIEWER })
      .expect(401);
  });

  test('AC-2: accepts an invitation once and grants the role', async () => {
    const application = await createApplication();
    const email = generateRandomEmail('guest');
    const created = await request(app)
      .post(`/applications/${application._id.toString()}/invitations`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ email, role: GrantRoles.ADMIN })
      .expect(201);
    const token = tokenFromLink(created.body.link);

    await request(app)
      .post('/auth/invitations/accept')
      .send({
        token,
        password: PASSWORD,
        passwordConfirmation: PASSWORD,
      })
      .expect(204);

    const login = await loginToApplication(email, application.slug).expect(200);
    const claims = JSON.parse(
      Buffer.from(
        login.body.accessToken.split('.')[1] as string,
        'base64',
      ).toString(),
    ) as { role?: string };

    assert.strictEqual(claims.role, GrantRoles.ADMIN);

    const response = await request(app)
      .post('/auth/invitations/accept')
      .send({
        token,
        password: PASSWORD,
        passwordConfirmation: PASSWORD,
      })
      .expect(400);

    assert.strictEqual(response.body.code, 'INVALID_LINK');
  });

  test('AC-3: rejects an expired link without creating the account', async () => {
    const application = await createApplication();
    const email = generateRandomEmail('guest');
    const created = await request(app)
      .post(`/applications/${application._id.toString()}/invitations`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ email, role: GrantRoles.VIEWER })
      .expect(201);
    const token = tokenFromLink(created.body.link);

    await fixture.updateOne<OneTimeLink>(
      'Link',
      { email: email.toLowerCase() },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    await request(app)
      .post('/auth/invitations/accept')
      .send({
        token,
        password: PASSWORD,
        passwordConfirmation: PASSWORD,
      })
      .expect(400);

    await loginToApplication(email, application.slug).expect(401);
  });

  test('validates the invitation input', async () => {
    const application = await createApplication();
    const path = `/applications/${application._id.toString()}/invitations`;

    await request(app)
      .post(path)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ email: 'not-an-email', role: GrantRoles.VIEWER })
      .expect(400);

    await request(app)
      .post(path)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({
        email: generateRandomEmail('guest'),
        role: 'superuser',
      })
      .expect(400);

    await request(app)
      .post('/applications/64b64c4f4f4f4f4f4f4f4f4f/invitations')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ email: generateRandomEmail('guest'), role: GrantRoles.VIEWER })
      .expect(404);
  });

  test('rejects an invitation for an existing account', async () => {
    const application = await createApplication();
    const user = await createUser();

    await request(app)
      .post(`/applications/${application._id.toString()}/invitations`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ email: user.email, role: GrantRoles.VIEWER })
      .expect(400);
  });
});
