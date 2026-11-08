import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import {
  AuditEvent,
  AuditResult,
  createAuditEventModel,
} from '../../../src/audit';
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
  sessionId?: string;
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

  const createUser = (overrides: Partial<User> = {}) =>
    fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('audit'),
      ...overrides,
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

    const [login] = success.body.items as AuditResponse[];
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

    assert.strictEqual((failed.body.items as AuditResponse[]).length, 1);
    assert.strictEqual(
      (failed.body.items as AuditResponse[])[0]?.email,
      user.email,
    );
    assert.strictEqual(
      (failed.body.items as AuditResponse[])[0]?.userId,
      user._id.toString(),
    );
  });

  test('records post-credential login denials with the user id', async () => {
    const unverified = await createUser({ verified: false });
    const { application: unverifiedApp } = await createApplicationAccess(
      unverified._id.toString(),
    );
    await request(app)
      .post('/auth/login')
      .send({
        email: unverified.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: unverifiedApp.slug,
      })
      .expect(403);

    const withoutGrant = await createUser();
    const application = await createApplication();
    await request(app)
      .post('/auth/login')
      .send({
        email: withoutGrant.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(403);

    const noApplication = await createUser();
    await request(app)
      .post('/auth/login')
      .send({
        email: noApplication.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
      })
      .expect(403);

    for (const user of [unverified, withoutGrant, noApplication]) {
      const response = await request(app)
        .get('/audit-events')
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .query({
          userId: user._id.toString(),
          event: AuditEvent.LOGIN_FAILED,
        })
        .expect(200);

      const [event] = response.body.items as AuditResponse[];
      assert.ok(event);
      assert.strictEqual(event?.userId, user._id.toString());
      assert.strictEqual(event?.result, AuditResult.FAILURE);
    }
  });

  test('records the application and email on token refresh', async () => {
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
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    const response = await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({
        applicationId: application._id.toString(),
        event: AuditEvent.TOKEN_REFRESHED,
      })
      .expect(200);

    const [event] = response.body.items as AuditResponse[];
    assert.ok(event);
    assert.strictEqual(event?.email, user.email);
    assert.strictEqual(event?.applicationId, application._id.toString());
    assert.strictEqual(event?.audience, application.audience);
  });

  test('records the session id and request context on revocation', async () => {
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

    const sessions = await request(app)
      .get('/auth/sessions')
      .set('Authorization', bearer(login.body.accessToken))
      .expect(200);
    const [session] = sessions.body as Array<{ id: string }>;

    await request(app)
      .delete(`/auth/sessions/${session!.id}`)
      .set('Authorization', bearer(login.body.accessToken))
      .set('X-Forwarded-For', '203.0.113.10')
      .set('User-Agent', 'Revoke Browser')
      .expect(204);

    await request(app)
      .delete('/auth/sessions')
      .set('Authorization', bearer(login.body.accessToken))
      .set('X-Forwarded-For', '203.0.113.11')
      .set('User-Agent', 'Revoke All Browser')
      .expect(204);

    const revoked = await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({ event: AuditEvent.SESSION_REVOKED })
      .expect(200);
    const [single] = revoked.body.items as AuditResponse[];
    assert.strictEqual(single?.sessionId, session!.id);
    assert.strictEqual(single?.ipAddress, '203.0.113.10');
    assert.strictEqual(single?.userAgent, 'Revoke Browser');

    const revokedAll = await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({ event: AuditEvent.SESSIONS_REVOKED })
      .expect(200);
    const [all] = revokedAll.body.items as AuditResponse[];
    assert.strictEqual(all?.ipAddress, '203.0.113.11');
    assert.strictEqual(all?.userAgent, 'Revoke All Browser');
  });

  test('records grants removed when the user is deleted', async () => {
    const target = await createUser();
    const { application } = await createApplicationAccess(
      target._id.toString(),
    );

    await request(app)
      .delete(`/users/${target._id.toString()}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(204);

    const response = await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({
        event: AuditEvent.GRANT_REVOKED,
      })
      .expect(200);

    const event = (response.body.items as AuditResponse[]).find(
      (item) => item.targetUserId === target._id.toString(),
    );
    assert.ok(event);
    assert.strictEqual(event?.applicationId, application._id.toString());
    assert.ok(event?.actorId);
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
    const [grant] = assigned.body.items as AuditResponse[];

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

    assert.strictEqual((revoked.body.items as AuditResponse[]).length, 1);
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

    const events = response.body.items as AuditResponse[];
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

  test('treats a date-only to as inclusive', async () => {
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

    const today = new Date().toISOString().slice(0, 10);

    const response = await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({ from: today, to: today, event: AuditEvent.LOGIN_SUCCEEDED })
      .expect(200);

    assert.ok((response.body.items as AuditResponse[]).length >= 1);
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

  describe('listing contract', () => {
    const seedEvents = (
      count: number,
      overrides: Record<string, unknown> = {},
    ) =>
      createAuditEventModel().insertMany(
        Array.from({ length: count }, (_, index) => ({
          event: AuditEvent.LOGIN_SUCCEEDED,
          result: AuditResult.SUCCESS,
          email: `seed-${index}@example.com`,
          ...overrides,
        })),
      );

    test('AC-1: walks a history larger than the old fixed cap without gaps', async () => {
      await seedEvents(205, { audience: 'bulk-aud' });

      const seen = new Set<string>();
      let total = 0;

      for (const page of [1, 2, 3]) {
        const response = await request(app)
          .get('/audit-events')
          .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
          .query({ page, limit: 100 })
          .expect(200);

        assert.strictEqual(response.body.total, 205);
        assert.strictEqual(response.body.page, page);
        assert.strictEqual(response.body.limit, 100);
        total += response.body.items.length;
        for (const event of response.body.items as AuditResponse[]) {
          assert.strictEqual(seen.has(event._id), false);
          seen.add(event._id);
        }
      }

      assert.strictEqual(total, 205);
      assert.strictEqual(seen.size, 205);
    });

    test('AC-2: searches by prefix on email, event and audience', async () => {
      await seedEvents(1, { email: 'login-user@example.com' });
      await seedEvents(1, {
        event: AuditEvent.LOGIN_FAILED,
        email: 'other@example.com',
      });
      await seedEvents(1, {
        event: AuditEvent.GRANT_ASSIGNED,
        email: 'other@example.com',
        audience: 'login-aud',
      });
      await seedEvents(1, {
        event: AuditEvent.GRANT_ASSIGNED,
        email: 'other@example.com',
        audience: 'unrelated-aud',
      });

      const response = await request(app)
        .get('/audit-events')
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .query({ q: 'login' })
        .expect(200);

      assert.strictEqual(response.body.total, 3);
      assert.strictEqual(response.body.items.length, 3);
    });

    test('AC-3: clamps the limit, rejects invalid pages and escapes metacharacters', async () => {
      await seedEvents(1);

      const clamped = await request(app)
        .get('/audit-events')
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .query({ limit: 1000 })
        .expect(200);
      assert.strictEqual(clamped.body.limit, 100);

      for (const query of [{ page: 0 }, { page: -1 }, { limit: 'abc' }]) {
        const response = await request(app)
          .get('/audit-events')
          .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
          .query(query)
          .expect(400);
        assert.strictEqual(response.body.code, 'INVALID_ARGUMENT');
      }

      const literal = await request(app)
        .get('/audit-events')
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .query({ q: '.*' })
        .expect(200);
      assert.strictEqual(literal.body.total, 0);
    });

    test('AC-4: repeats the same page with a stable order', async () => {
      await seedEvents(10, { audience: 'stable-aud' });

      const first = await request(app)
        .get('/audit-events')
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .query({ page: 1, limit: 5 })
        .expect(200);
      const second = await request(app)
        .get('/audit-events')
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .query({ page: 1, limit: 5 })
        .expect(200);

      assert.deepStrictEqual(
        (first.body.items as AuditResponse[]).map((event) => event._id),
        (second.body.items as AuditResponse[]).map((event) => event._id),
      );
    });

    test('AC-5: combines the existing filters with pagination', async () => {
      const user = await createUser();
      const { application } = await createApplicationAccess(
        user._id.toString(),
      );

      await request(app)
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
        .query({
          applicationId: application._id.toString(),
          event: AuditEvent.LOGIN_SUCCEEDED,
          page: 1,
          limit: 1,
        })
        .expect(200);

      assert.strictEqual(response.body.total, 1);
      assert.strictEqual(response.body.items.length, 1);
      assert.strictEqual(
        (response.body.items as AuditResponse[])[0]?.applicationId,
        application._id.toString(),
      );
    });

    test('AC-6: keeps the audit log owner-only', async () => {
      await request(app)
        .get('/audit-events')
        .query({ page: 1, limit: 1 })
        .expect(401);

      await request(app)
        .get('/audit-events')
        .set('Authorization', bearer(DEFAULT_USER_TOKEN))
        .query({ page: 1, limit: 1 })
        .expect(403);
    });
  });
});
