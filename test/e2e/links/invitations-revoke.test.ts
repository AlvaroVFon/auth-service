import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { GrantRoles } from '../../../src/grants/grants.interface';
import { hashLinkToken } from '../../../src/links/link-token';
import { LinkType, type OneTimeLink } from '../../../src/links/link.interface';
import { LinkModel } from '../../../src/links/links.schema';
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

describe('E2E invitation revocation', () => {
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
        email: generateRandomEmail('revoke-admin+'),
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

    return { token: login.body.accessToken as string, adminId: admin._id };
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

  test('AC-1/AC-4: revokes a pending invitation, rejects the link and audits the actor', async () => {
    const application = await createApplication();
    const { token, adminId } = await createAdminToken(application);
    const rawToken = 'raw-invitation-token';
    const invitation = await seedInvitation(application._id, {
      tokenHash: hashLinkToken(rawToken),
    });

    await request(app)
      .delete(
        `/applications/${application._id.toString()}/invitations/${invitation._id.toString()}`,
      )
      .set('Authorization', bearer(token))
      .expect(204);

    const stored = await fixture.findById<OneTimeLink>(
      LinkModel.modelName,
      invitation._id.toString(),
    );
    assert.ok(stored?.invalidatedAt instanceof Date);

    await request(app)
      .post('/auth/invitations/accept')
      .send({
        token: rawToken,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        passwordConfirmation: DEFAULT_USER_PLAIN_PASSWORD,
      })
      .expect(400);

    const events = await request(app)
      .get('/audit-events')
      .query({ event: 'invitation.revoked' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    const items = (
      Array.isArray(events.body) ? events.body : events.body.items
    ) as Array<{ actorId?: string; applicationId?: string }>;
    const event = items.at(-1);
    assert.strictEqual(event?.actorId, adminId.toString());
    assert.strictEqual(event?.applicationId, application._id.toString());
  });

  test('AC-2: returns 409 for an already used invitation', async () => {
    const application = await createApplication();
    const { token } = await createAdminToken(application);
    const invitation = await seedInvitation(application._id, {
      tokenHash: 'used',
      usedAt: new Date(),
    });

    await request(app)
      .delete(
        `/applications/${application._id.toString()}/invitations/${invitation._id.toString()}`,
      )
      .set('Authorization', bearer(token))
      .expect(409);

    const stored = await fixture.findById<OneTimeLink>(
      LinkModel.modelName,
      invitation._id.toString(),
    );
    assert.strictEqual(stored?.invalidatedAt, null);
  });

  test('AC-3: hides an invitation of another application', async () => {
    const applicationA = await createApplication();
    const applicationB = await createApplication();
    const { token } = await createAdminToken(applicationA);
    const invitation = await seedInvitation(applicationB._id, {
      tokenHash: 'foreign',
    });

    await request(app)
      .delete(
        `/applications/${applicationA._id.toString()}/invitations/${invitation._id.toString()}`,
      )
      .set('Authorization', bearer(token))
      .expect(404);

    const stored = await fixture.findById<OneTimeLink>(
      LinkModel.modelName,
      invitation._id.toString(),
    );
    assert.strictEqual(stored?.invalidatedAt, null);
  });
});
