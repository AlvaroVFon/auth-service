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
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E invitation resend', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createApplication = () =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(),
    );

  const seedInvitation = (
    applicationId: Types.ObjectId,
    overrides: Partial<OneTimeLink> & { tokenHash: string },
  ) =>
    fixture.create<OneTimeLink>(LinkModel.modelName, {
      type: LinkType.INVITATION,
      applicationId,
      email: generateRandomEmail('resend+'),
      role: GrantRoles.VIEWER,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    });

  const resend = (
    applicationId: string,
    invitationId: string,
    token = DEFAULT_OWNER_TOKEN,
  ) =>
    request(app)
      .post(`/applications/${applicationId}/invitations/${invitationId}/resend`)
      .set('Authorization', bearer(token));

  test('AC-1/AC-4: invalidates the old link, returns a new one and audits the resend', async () => {
    const application = await createApplication();
    const oldToken = 'old-invitation-token';
    const invitation = await seedInvitation(application._id, {
      tokenHash: hashLinkToken(oldToken),
    });

    const response = await resend(
      application._id.toString(),
      invitation._id.toString(),
    ).expect(201);

    assert.ok(response.body.link);
    assert.ok(response.body.expiresAt);
    const stored = await fixture.findById<OneTimeLink>(
      LinkModel.modelName,
      invitation._id.toString(),
    );
    assert.ok(stored?.invalidatedAt instanceof Date);

    await request(app)
      .post('/auth/invitations/accept')
      .send({
        token: oldToken,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        passwordConfirmation: DEFAULT_USER_PLAIN_PASSWORD,
      })
      .expect(400);

    const newToken = new URL(response.body.link as string).searchParams.get(
      'token',
    );
    assert.ok(newToken);
    await request(app)
      .post('/auth/invitations/accept')
      .send({
        token: newToken,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        passwordConfirmation: DEFAULT_USER_PLAIN_PASSWORD,
      })
      .expect(204);

    const events = await request(app)
      .get('/audit-events')
      .query({ event: 'invitation.resent' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    const items = (
      Array.isArray(events.body) ? events.body : events.body.items
    ) as Array<{ applicationId?: string }>;
    assert.ok(
      items.some((event) => event.applicationId === application._id.toString()),
    );
  });

  test('AC-2: refuses to resend a used invitation without creating a link', async () => {
    const application = await createApplication();
    const invitation = await seedInvitation(application._id, {
      tokenHash: 'used',
      usedAt: new Date(),
    });
    const before = await LinkModel.countDocuments({
      applicationId: application._id,
    });

    await resend(application._id.toString(), invitation._id.toString()).expect(
      409,
    );

    assert.strictEqual(
      await LinkModel.countDocuments({ applicationId: application._id }),
      before,
    );
  });

  test('AC-3: rate limits repeated resends for the same invitation', async () => {
    const application = await createApplication();
    const invitation = await seedInvitation(application._id, {
      tokenHash: 'rate',
    });
    const applicationId = application._id.toString();
    const invitationId = invitation._id.toString();

    await resend(applicationId, invitationId).expect(201);
    await resend(applicationId, invitationId).expect(409);
    await resend(applicationId, invitationId).expect(409);
    await resend(applicationId, invitationId).expect(429);
  });
});
