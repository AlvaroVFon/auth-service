import express, { Application } from 'express';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { createApplicationComposition } from '../../../src/config/application.composition';
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
import { createBaseTestOptions, getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E application member creation', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createApplication = () =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(),
    );

  const createUser = (overrides: Record<string, unknown> = {}) =>
    fixture.create(
      'User',
      UserFactory.generate({
        email: generateRandomEmail('member+'),
        password: DEFAULT_USER.password,
        verified: true,
        ...overrides,
      }),
    );

  const createAdminToken = async (application: ApplicationInterface) => {
    const admin = await createUser();
    await fixture.create(
      'Grant',
      GrantFactory.generate({
        userId: admin._id,
        applicationId: application._id,
        role: GrantRoles.ADMIN,
      }),
    );
    const login = await request(app)
      .post('/auth/login')
      .send({
        email: admin.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    return login.body.accessToken as string;
  };

  test('AC-1/AC-4: grants an existing account, converges the role and audits it', async () => {
    const application = await createApplication();
    const target = await createUser();
    const token = await createAdminToken(application);
    const path = `/applications/${application._id.toString()}/members`;

    const first = await request(app)
      .post(path)
      .set('Authorization', bearer(token))
      .send({ email: target.email, role: GrantRoles.EDITOR })
      .expect(201);
    assert.deepStrictEqual(first.body, {
      email: target.email,
      role: GrantRoles.EDITOR,
    });

    await request(app)
      .post(path)
      .set('Authorization', bearer(token))
      .send({ email: target.email, role: GrantRoles.VIEWER })
      .expect(201);

    const grants = await request(app)
      .get(`/applications/${application._id.toString()}/grants`)
      .set('Authorization', bearer(token))
      .expect(200);
    const targetGrants = (
      grants.body as Array<{ userId: string; role: string }>
    ).filter((grant) => grant.userId === target._id.toString());
    assert.strictEqual(targetGrants.length, 1);
    assert.strictEqual(targetGrants[0]?.role, GrantRoles.VIEWER);

    const events = await request(app)
      .get('/audit-events')
      .query({ event: 'member.granted' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    const items = (
      Array.isArray(events.body) ? events.body : events.body.items
    ) as Array<{ targetUserId?: string; applicationId?: string }>;
    assert.ok(
      items.some(
        (event) =>
          event.targetUserId === target._id.toString() &&
          event.applicationId === application._id.toString(),
      ),
    );
  });

  test('AC-2: answers the same neutral body for an email without an account', async () => {
    const application = await createApplication();
    const token = await createAdminToken(application);
    const email = generateRandomEmail('unknown-member+');

    const response = await request(app)
      .post(`/applications/${application._id.toString()}/members`)
      .set('Authorization', bearer(token))
      .send({ email, role: GrantRoles.VIEWER })
      .expect(201);

    assert.deepStrictEqual(response.body, {
      email,
      role: GrantRoles.VIEWER,
    });
    assert.strictEqual(await fixture.findOne('User', { email }), null);
  });

  test('AC-3: isolates applications and enforces the admin-role rule', async () => {
    const applicationA = await createApplication();
    const applicationB = await createApplication();
    const target = await createUser();
    const tokenA = await createAdminToken(applicationA);

    await request(app)
      .post(`/applications/${applicationB._id.toString()}/members`)
      .set('Authorization', bearer(tokenA))
      .send({ email: target.email, role: GrantRoles.VIEWER })
      .expect(403);

    await request(app)
      .post(`/applications/${applicationA._id.toString()}/members`)
      .set('Authorization', bearer(tokenA))
      .send({ email: target.email, role: GrantRoles.ADMIN })
      .expect(403);

    await request(app)
      .put(`/applications/${applicationA._id.toString()}/grants`)
      .set('Authorization', bearer(tokenA))
      .send({ userId: target._id.toString(), role: GrantRoles.ADMIN })
      .expect(403);

    await request(app)
      .post(`/applications/${applicationA._id.toString()}/members`)
      .send({ email: target.email, role: GrantRoles.VIEWER })
      .expect(401);

    await request(app)
      .post(`/applications/${applicationA._id.toString()}/members`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ email: target.email, role: GrantRoles.ADMIN })
      .expect(201);
  });

  test('AC-5: rate limits only the member write route', async () => {
    const limitedApp = express();
    createApplicationComposition({
      ...createBaseTestOptions(),
      grantsRateLimit: {
        membersWrite: { windowMs: 60_000, max: 1 },
      },
    }).initialize(limitedApp);
    const application = await createApplication();
    const path = `/applications/${application._id.toString()}/members`;

    await request(limitedApp)
      .post(path)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({
        email: generateRandomEmail('rate+'),
        role: GrantRoles.VIEWER,
      })
      .expect(201);
    await request(limitedApp)
      .post(path)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({
        email: generateRandomEmail('rate+'),
        role: GrantRoles.VIEWER,
      })
      .expect(429);

    // Other grant routes keep their own budget.
    await request(limitedApp)
      .get(`/applications/${application._id.toString()}/grants`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
  });
});
