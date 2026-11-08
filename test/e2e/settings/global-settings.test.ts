import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import { GrantRoles } from '../../../src/grants/grants.interface';
import type { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_ID,
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_PLAIN_PASSWORD,
  DEFAULT_USER_TOKEN,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { createApplicationAccess } from '../../helpers/application-access';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E global settings', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('AC-1: the owner reads the effective global policy', async () => {
    const response = await request(app)
      .get('/settings')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.ok(response.body.settings);
    assert.ok(response.body.sources);
    assert.ok(response.body.defaults);
    assert.strictEqual(typeof response.body.settings.appName, 'string');
    assert.strictEqual(response.body.sources.appName, 'default');

    const serialized = JSON.stringify(response.body);
    for (const secret of [
      'JWT_PRIVATE_KEY',
      'SMTP_PASS',
      'TELEGRAM_BOT_TOKEN',
    ]) {
      assert.strictEqual(serialized.includes(secret), false);
    }
  });

  test('AC-2: a partial patch changes one field and audits settings.updated', async () => {
    const response = await request(app)
      .patch('/settings')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ appName: 'Panel' })
      .expect(200);

    assert.strictEqual(response.body.settings.appName, 'Panel');
    assert.strictEqual(response.body.sources.appName, 'global');

    const read = await request(app)
      .get('/settings')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    assert.strictEqual(read.body.settings.appName, 'Panel');

    const events = await request(app)
      .get('/audit-events')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .query({ event: 'settings.updated' })
      .expect(200);
    const items = (
      Array.isArray(events.body) ? events.body : events.body.items
    ) as Array<{
      actorId?: string;
      fields?: string[];
    }>;
    const event = items.at(-1);
    assert.strictEqual(event?.actorId, DEFAULT_OWNER_ID.toString());
    assert.deepStrictEqual(event?.fields, ['appName']);
  });

  test('AC-3: invalid values answer 400 without changing the policy', async () => {
    for (const patch of [
      { accessTokenTtlSeconds: -1 },
      { mfaPolicy: 'sometimes' },
      { maxSessionsPerUser: 0 },
      { unknownField: 1 },
    ]) {
      const response = await request(app)
        .patch('/settings')
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .send(patch)
        .expect(400);
      assert.strictEqual(response.body.code, 'INVALID_ARGUMENT');
    }

    const read = await request(app)
      .get('/settings')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    assert.strictEqual(read.body.settings.appName, 'Panel');
  });

  test('AC-4: only the owner can read or write the policy', async () => {
    await request(app)
      .get('/settings')
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .expect(403);
    await request(app)
      .patch('/settings')
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .send({ appName: 'Nope' })
      .expect(403);

    const user = await fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('settings-admin'),
    });
    const { application } = await createApplicationAccess(
      user._id.toString(),
      GrantRoles.ADMIN,
    );
    const login = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);
    const appToken = login.body.accessToken as string;

    await request(app)
      .get('/settings')
      .set('Authorization', bearer(appToken))
      .expect(403);
    await request(app)
      .patch('/settings')
      .set('Authorization', bearer(appToken))
      .send({ appName: 'Nope' })
      .expect(403);

    await request(app).get('/settings').expect(401);
  });
});
