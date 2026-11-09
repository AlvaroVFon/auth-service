import { Application } from 'express';
import request from 'supertest';

import { AUDIT_EVENT_DESCRIPTIONS, AuditEvent } from '../../../src/audit';
import { createAuditEventModel } from '../../../src/audit/audit.schema';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_TOKEN,
} from '../../fixtures/defaults';
import { getTestAppInstance } from '../../utils/app';

const AuditModel = createAuditEventModel();
const bearer = (token: string) => `Bearer ${token}`;

describe('E2E audit catalog and export', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const seed = (event: AuditEvent, createdAt: Date) =>
    AuditModel.collection.insertOne({
      event,
      result: 'success',
      createdAt,
      updatedAt: createdAt,
    });

  test('AC-1: the owner reads the static event catalog', async () => {
    const response = await request(app)
      .get('/audit-events/events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    const events = response.body.events as Array<{
      event: string;
      description: string;
    }>;
    assert.deepStrictEqual(
      events.map((entry) => entry.event).sort(),
      Object.values(AuditEvent).sort(),
    );
    for (const entry of events) {
      assert.strictEqual(
        entry.description,
        AUDIT_EVENT_DESCRIPTIONS[entry.event as AuditEvent],
      );
    }
  });

  test('AC-2/AC-5: exports only the filtered rows with a stable CSV header', async () => {
    const now = Date.now();
    await seed(AuditEvent.LOGIN_SUCCEEDED, new Date(now - 60_000));
    await seed(AuditEvent.LOGIN_FAILED, new Date(now - 120_000));
    await seed(AuditEvent.GRANT_ASSIGNED, new Date(now - 180_000));

    const response = await request(app)
      .get('/audit-events/export')
      .query({
        event: AuditEvent.LOGIN_SUCCEEDED,
        from: new Date(now - 3_600_000).toISOString(),
        to: new Date(now).toISOString(),
      })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.match(response.headers['content-type'], /text\/csv/);
    assert.match(
      response.headers['content-disposition'],
      /attachment; filename="audit-events.csv"/,
    );
    const lines = response.text.trim().split('\n');
    assert.strictEqual(
      lines[0],
      'createdAt,event,result,actorId,targetUserId,applicationId,audience',
    );
    assert.strictEqual(lines.length, 2);
    assert.match(lines[1]!, /login\.succeeded/);
    assert.strictEqual(response.text.includes('login.failed'), false);
    assert.strictEqual(response.text.includes('grant.assigned'), false);
    for (const secret of ['token', 'password', 'authorization']) {
      assert.strictEqual(response.text.toLowerCase().includes(secret), false);
    }
  });

  test('AC-4: an app admin cannot read the catalog or export', async () => {
    await request(app)
      .get('/audit-events/events')
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .expect(403);
    await request(app)
      .get('/audit-events/export')
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .expect(403);
  });
});
