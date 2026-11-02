import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { AuditEvent, AuditResult } from '../../../src/audit';
import { GrantRoles } from '../../../src/grants/grants.interface';
import type { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_PLAIN_PASSWORD,
  DEFAULT_USER_TOKEN,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { createApplicationAccess } from '../../helpers/application-access';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

interface AuditResponse {
  _id: string;
  event: string;
  result: string;
  userId?: string;
  email?: string;
  applicationId?: string;
  audience?: string;
  role?: string;
  actorId?: string;
  targetUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

describe('E2E audit events', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createUser = () =>
    fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('audit'),
    });

  const createApplication = () =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(),
    );

  test('AC-1: records successful and failed logins', async () => {
    const user = await createUser();
    const { application } = await createApplicationAccess(user._id.toString());

    await request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', '203.0.113.9')
      .set('User-Agent', 'Audit Browser')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: 'WrongPassword123!',
        application: application.slug,
      })
      .expect(401);

    const success = await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({ userId: user._id.toString(), event: AuditEvent.LOGIN_SUCCEEDED })
      .expect(200);

    const [login] = success.body as AuditResponse[];
    assert.ok(login);
    assert.strictEqual(login?.event, AuditEvent.LOGIN_SUCCEEDED);
    assert.strictEqual(login?.result, AuditResult.SUCCESS);
    assert.strictEqual(login?.email, user.email);
    assert.strictEqual(login?.applicationId, application._id.toString());
    assert.strictEqual(login?.audience, application.audience);
    assert.strictEqual(login?.ipAddress, '203.0.113.9');
    assert.strictEqual(login?.userAgent, 'Audit Browser');

    const failed = await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({ event: AuditEvent.LOGIN_FAILED })
      .expect(200);

    assert.strictEqual((failed.body as AuditResponse[]).length, 1);
    assert.strictEqual((failed.body as AuditResponse[])[0]?.email, user.email);
  });

  test('AC-2: records who changed which grant', async () => {
    const application = await createApplication();
    const target = await createUser();

    await request(app)
      .put(`/applications/${application._id.toString()}/grants`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ userId: target._id.toString(), role: GrantRoles.EDITOR })
      .expect(200);

    await request(app)
      .delete(
        `/applications/${application._id.toString()}/grants/${target._id.toString()}`,
      )
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(204);

    const assigned = await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({ event: AuditEvent.GRANT_ASSIGNED })
      .expect(200);
    const [grant] = assigned.body as AuditResponse[];

    assert.ok(grant);
    assert.strictEqual(grant?.result, AuditResult.SUCCESS);
    assert.strictEqual(grant?.targetUserId, target._id.toString());
    assert.strictEqual(grant?.applicationId, application._id.toString());
    assert.strictEqual(grant?.role, GrantRoles.EDITOR);
    assert.ok(grant?.actorId);

    const revoked = await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({ event: AuditEvent.GRANT_REVOKED })
      .expect(200);

    assert.strictEqual((revoked.body as AuditResponse[]).length, 1);
  });

  test('AC-3: never exposes credentials or tokens', async () => {
    const user = await createUser();
    const { application } = await createApplicationAccess(user._id.toString());
    const login = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    const response = await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    const serialized = JSON.stringify(response.body);

    assert.strictEqual(serialized.includes(DEFAULT_USER_PLAIN_PASSWORD), false);
    assert.strictEqual(serialized.includes(login.body.accessToken), false);
    assert.strictEqual(serialized.includes(login.body.refreshToken), false);
  });

  test('AC-4: lets the owner filter by date and app', async () => {
    const user = await createUser();
    const { application } = await createApplicationAccess(user._id.toString());

    await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    const from = new Date(Date.now() - 60_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();

    const response = await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({
        applicationId: application._id.toString(),
        from,
        to,
      })
      .expect(200);

    const events = response.body as AuditResponse[];
    assert.ok(events.length >= 1);
    assert.ok(
      events.every(
        (event) =>
          event.applicationId === application._id.toString() &&
          event.createdAt >= from &&
          event.createdAt <= to,
      ),
    );
  });

  test('restricts the audit log to the owner', async () => {
    await request(app).get('/audit-events').expect(401);

    await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .expect(403);

    const user = await createUser();
    const { application } = await createApplicationAccess(user._id.toString());
    const login = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(login.body.accessToken))
      .expect(401);
  });

  test('validates the filters', async () => {
    await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({ userId: 'bad-id' })
      .expect(400);

    await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({ event: 'unknown' })
      .expect(400);

    await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({ from: 'not-a-date' })
      .expect(400);
  });
});
