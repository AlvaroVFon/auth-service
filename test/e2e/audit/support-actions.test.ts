import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import { AuditEvent } from '../../../src/audit';
import type { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_ID,
  DEFAULT_OWNER_TOKEN,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

interface AuditResponse {
  event: string;
  result: string;
  actorId?: string;
  targetUserId?: string;
}

describe('E2E audit of support actions', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createUser = () =>
    fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('support-audit'),
      verified: false,
    });

  const eventsOf = async (event: AuditEvent): Promise<AuditResponse[]> => {
    const response = await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({ event, limit: 50 })
      .expect(200);

    // Tolerates both the legacy array and the paginated envelope while the
    // listing contract lands.
    return (
      Array.isArray(response.body) ? response.body : response.body.items
    ).filter((record: AuditResponse) => record.event === event);
  };

  test('records user.unlocked with the actor and the target', async () => {
    const user = await createUser();

    await request(app)
      .post(`/users/${user._id.toString()}/unlock`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    const events = await eventsOf(AuditEvent.USER_UNLOCKED);

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]?.result, 'success');
    assert.strictEqual(events[0]?.actorId, DEFAULT_OWNER_ID.toString());
    assert.strictEqual(events[0]?.targetUserId, user._id.toString());
  });

  test('records user.verified with the actor and the target', async () => {
    const user = await createUser();

    await request(app)
      .post(`/users/${user._id.toString()}/verify`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    const events = await eventsOf(AuditEvent.USER_VERIFIED);

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]?.result, 'success');
    assert.strictEqual(events[0]?.actorId, DEFAULT_OWNER_ID.toString());
    assert.strictEqual(events[0]?.targetUserId, user._id.toString());
  });

  test('does not audit a rejected support action', async () => {
    const unknown = new Types.ObjectId().toString();

    await request(app)
      .post(`/users/${unknown}/unlock`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(404);

    const events = await eventsOf(AuditEvent.USER_UNLOCKED);
    assert.strictEqual(events.length, 0);
  });
});
