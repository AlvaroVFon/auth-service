import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { AuditEvent } from '../../../src/audit';
import { Grant, GrantRoles } from '../../../src/grants/grants.interface';
import type { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_ADMIN_TOKEN,
  DEFAULT_OWNER_ID,
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
  refreshToken: string;
}

interface AuditResponse {
  event: string;
  result: string;
  actorId?: string;
  applicationId?: string;
}

describe('E2E Applications lifecycle', () => {
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
      email: generateRandomEmail('lifecycle'),
      ...overrides,
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

  const auditEvents = async (
    applicationId: string,
    event: AuditEvent,
  ): Promise<AuditResponse[]> => {
    const response = await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({ applicationId, event })
      .expect(200);

    return response.body as AuditResponse[];
  };

  test('AC-1: the owner renames an application and the change is persisted', async () => {
    const application = await createApplication();

    const patched = await request(app)
      .patch(`/applications/${application._id.toString()}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ name: '  Renamed Application  ' })
      .expect(200);

    assert.strictEqual(patched.body.name, 'Renamed Application');
    assert.strictEqual(patched.body.slug, application.slug);
    assert.strictEqual(patched.body.audience, application.audience);

    const persisted = await fixture.findOne<ApplicationInterface>(
      'Application',
      { _id: application._id },
    );
    assert.strictEqual(persisted?.name, 'Renamed Application');

    const events = await auditEvents(
      application._id.toString(),
      AuditEvent.APPLICATION_UPDATED,
    );
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]?.result, 'success');
    assert.strictEqual(events[0]?.actorId, DEFAULT_OWNER_ID.toString());
    assert.strictEqual(events[0]?.applicationId, application._id.toString());
  });

  test('AC-5: rejects immutable fields and an empty name without changing the application', async () => {
    const application = await createApplication();

    for (const payload of [
      { slug: 'another-slug' },
      { audience: 'another-audience' },
      { name: '' },
      { name: '   ' },
      { _id: new Types.ObjectId().toString() },
      { __v: 9 },
    ]) {
      const response = await request(app)
        .patch(`/applications/${application._id.toString()}`)
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .send(payload)
        .expect(400);

      assert.strictEqual(response.body.code, 'INVALID_ARGUMENT');
    }

    const persisted = await fixture.findOne<ApplicationInterface>(
      'Application',
      { _id: application._id },
    );
    assert.strictEqual(persisted?.name, application.name);
    assert.strictEqual(persisted?.slug, application.slug);
    assert.strictEqual(persisted?.audience, application.audience);
    assert.strictEqual(persisted?.active, true);

    // A present-but-wrong type is not a missing value: the message must not
    // claim the name is absent.
    const wrongType = await request(app)
      .patch(`/applications/${application._id.toString()}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ name: 42 })
      .expect(400);
    assert.strictEqual(wrongType.body.message, 'Name must be a string');

    const stillPersisted = await fixture.findOne<ApplicationInterface>(
      'Application',
      { _id: application._id },
    );
    assert.strictEqual(stillPersisted?.name, application.name);

    const events = await auditEvents(
      application._id.toString(),
      AuditEvent.APPLICATION_UPDATED,
    );
    assert.strictEqual(events.length, 0);
  });

  test('AC-2: deactivating collapses the login, stops the refresh and reactivating restores it', async () => {
    const user = await createUser();
    const application = await createApplication();
    await grantRole(user._id.toString(), application._id, GrantRoles.VIEWER);
    const applicationId = application._id.toString();

    const tokens = (await login(user.email, application.slug).expect(200))
      .body as LoginResponse;

    await request(app)
      .patch(`/applications/${applicationId}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ active: false })
      .expect(200)
      .expect(({ body }) => assert.strictEqual(body.active, false));

    const denied = await login(user.email, application.slug).expect(403);
    assert.strictEqual(
      denied.body.message,
      'User has no access to this application',
    );
    assert.strictEqual(denied.body.accessToken, undefined);

    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(403);

    // The denied refresh revoked the session: reactivating restores the login,
    // not that particular session.
    await request(app)
      .patch(`/applications/${applicationId}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ active: true })
      .expect(200)
      .expect(({ body }) => assert.strictEqual(body.active, true));

    await login(user.email, application.slug).expect(200);

    const deactivated = await auditEvents(
      applicationId,
      AuditEvent.APPLICATION_DEACTIVATED,
    );
    assert.strictEqual(deactivated.length, 1);
    assert.strictEqual(deactivated[0]?.actorId, DEFAULT_OWNER_ID.toString());

    const activated = await auditEvents(
      applicationId,
      AuditEvent.APPLICATION_ACTIVATED,
    );
    assert.strictEqual(activated.length, 1);
    assert.strictEqual(activated[0]?.actorId, DEFAULT_OWNER_ID.toString());
  });

  test('AC-3: DELETE archives twice with 200 and keeps the document and its grants', async () => {
    const user = await createUser();
    const application = await createApplication();
    await grantRole(user._id.toString(), application._id, GrantRoles.EDITOR);
    const applicationId = application._id.toString();

    const first = await request(app)
      .delete(`/applications/${applicationId}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    assert.strictEqual(first.body.active, false);

    const second = await request(app)
      .delete(`/applications/${applicationId}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    assert.strictEqual(second.body.active, false);

    const persisted = await fixture.findOne<ApplicationInterface>(
      'Application',
      { _id: application._id },
    );
    assert.ok(persisted);
    assert.strictEqual(persisted?.active, false);

    const grants = await fixture.find<Grant>('Grant', {
      applicationId: application._id,
    });
    assert.strictEqual(grants.length, 1);

    const events = await auditEvents(
      applicationId,
      AuditEvent.APPLICATION_ARCHIVED,
    );
    assert.strictEqual(events.length, 1);
  });

  test('returns 404 for an unknown application and 400 for an invalid id', async () => {
    await request(app)
      .patch(`/applications/${new Types.ObjectId().toString()}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ name: 'Renamed' })
      .expect(404);

    await request(app)
      .delete(`/applications/${new Types.ObjectId().toString()}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(404);

    await request(app)
      .patch('/applications/bad-id')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ name: 'Renamed' })
      .expect(400);

    await request(app)
      .delete('/applications/bad-id')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(400);
  });

  test('rejects every non-owner caller and requires authentication', async () => {
    const application = await createApplication();
    const applicationId = application._id.toString();
    const appAdmin = await createUser();
    await grantRole(appAdmin._id.toString(), application._id, GrantRoles.ADMIN);
    const appAdminTokens = (
      await login(appAdmin.email, application.slug).expect(200)
    ).body as LoginResponse;

    // An application-scoped token carries an `aud` claim; the authentication
    // middleware only accepts global tokens on the owner surface, so the app
    // admin never reaches the authorization guard.
    for (const token of [appAdminTokens.accessToken]) {
      await request(app)
        .patch(`/applications/${applicationId}`)
        .set('Authorization', bearer(token))
        .send({ name: 'Renamed' })
        .expect(401);

      await request(app)
        .delete(`/applications/${applicationId}`)
        .set('Authorization', bearer(token))
        .expect(401);
    }

    for (const token of [DEFAULT_ADMIN_TOKEN, DEFAULT_USER_TOKEN]) {
      await request(app)
        .patch(`/applications/${applicationId}`)
        .set('Authorization', bearer(token))
        .send({ name: 'Renamed' })
        .expect(403);

      await request(app)
        .delete(`/applications/${applicationId}`)
        .set('Authorization', bearer(token))
        .expect(403);
    }

    const persisted = await fixture.findOne<ApplicationInterface>(
      'Application',
      { _id: application._id },
    );
    assert.strictEqual(persisted?.name, application.name);
    assert.strictEqual(persisted?.active, true);

    await request(app)
      .patch(`/applications/${applicationId}`)
      .send({ name: 'Renamed' })
      .expect(401);

    await request(app).delete(`/applications/${applicationId}`).expect(401);
  });
});
