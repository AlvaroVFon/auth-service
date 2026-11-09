import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { GrantRoles } from '../../../src/grants/grants.interface';
import { LinkType, type OneTimeLink } from '../../../src/links/link.interface';
import { LinkModel } from '../../../src/links/links.schema';
import fixture from '../../fixtures';
import {
  DEFAULT_USER,
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { GrantFactory } from '../../helpers/factories/grant.factory';
import { UserFactory } from '../../helpers/factories/user.factory';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E application invitations listing', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createApplication = () =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(),
    );

  const createAdminToken = async (application: ApplicationInterface) => {
    const admin = await fixture.create(
      'User',
      UserFactory.generate({
        email: generateRandomEmail('invitations-admin+'),
        password: DEFAULT_USER.password,
        verified: true,
      }),
    );
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

  const seedInvitation = (
    applicationId: Types.ObjectId,
    overrides: Partial<OneTimeLink> & { tokenHash: string },
  ) =>
    fixture.create<OneTimeLink>(LinkModel.modelName, {
      type: LinkType.INVITATION,
      applicationId,
      email: 'invitee@example.com',
      role: GrantRoles.VIEWER,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    });

  test('AC-1/AC-4: lists states in the envelope without secrets', async () => {
    const application = await createApplication();
    const token = await createAdminToken(application);
    const now = Date.now();
    await seedInvitation(application._id, { tokenHash: 'pending' });
    await seedInvitation(application._id, {
      tokenHash: 'used',
      usedAt: new Date(now - 1000),
    });
    await seedInvitation(application._id, {
      tokenHash: 'expired',
      expiresAt: new Date(now - 60_000),
    });
    await seedInvitation(application._id, {
      tokenHash: 'invalidated',
      invalidatedAt: new Date(now - 1000),
      telegramChatId: '999',
    });

    const response = await request(app)
      .get(`/applications/${application._id.toString()}/invitations`)
      .set('Authorization', bearer(token))
      .expect(200);

    assert.strictEqual(response.body.total, 4);
    assert.strictEqual(response.body.page, 1);
    assert.strictEqual(response.body.limit, 20);
    assert.deepStrictEqual(
      (response.body.items as Array<{ state: string }>)
        .map((item) => item.state)
        .sort(),
      ['expired', 'invalidated', 'pending', 'used'],
    );
    const serialized = JSON.stringify(response.body);
    assert.strictEqual(serialized.includes('tokenHash'), false);
    assert.strictEqual(serialized.includes('telegramChatId'), false);
    assert.strictEqual(serialized.includes('999'), false);
  });

  test('AC-2: filters by state and keeps total in sync', async () => {
    const application = await createApplication();
    const token = await createAdminToken(application);
    await seedInvitation(application._id, { tokenHash: 'pending-1' });
    await seedInvitation(application._id, { tokenHash: 'pending-2' });
    await seedInvitation(application._id, {
      tokenHash: 'used',
      usedAt: new Date(),
    });

    const response = await request(app)
      .get(
        `/applications/${application._id.toString()}/invitations?state=pending`,
      )
      .set('Authorization', bearer(token))
      .expect(200);

    assert.strictEqual(response.body.total, 2);
    assert.strictEqual(response.body.items.length, 2);
    assert.ok(
      (response.body.items as Array<{ state: string }>).every(
        (item) => item.state === 'pending',
      ),
    );
  });

  test('AC-3: an app admin cannot read another application and data stays isolated', async () => {
    const applicationA = await createApplication();
    const applicationB = await createApplication();
    const token = await createAdminToken(applicationA);
    await seedInvitation(applicationB._id, { tokenHash: 'from-b' });

    await request(app)
      .get(`/applications/${applicationB._id.toString()}/invitations`)
      .set('Authorization', bearer(token))
      .expect(403);

    const response = await request(app)
      .get(`/applications/${applicationA._id.toString()}/invitations`)
      .set('Authorization', bearer(token))
      .expect(200);
    assert.strictEqual(response.body.total, 0);
  });
});
