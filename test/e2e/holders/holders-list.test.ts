import { Application } from 'express';
import request from 'supertest';

import type { Holder } from '../../../src/holders/holders.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_TOKEN,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E holders listing', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('lists the pending holders in the shared envelope without secrets', async () => {
    await fixture.createMany<Holder>('Holder', [
      {
        email: generateRandomEmail('holder-a+'),
        password: 'hashed-password',
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        email: generateRandomEmail('holder-b+'),
        password: 'hashed-password',
        expiresAt: new Date(Date.now() + 120_000),
      },
    ]);

    const response = await request(app)
      .get('/holders')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(response.body.total, 2);
    assert.strictEqual(response.body.items.length, 2);
    for (const item of response.body.items as Array<Record<string, unknown>>) {
      assert.ok(item.id);
      assert.ok(item.email);
      assert.ok(item.expiresAt);
      assert.strictEqual('password' in item, false);
      assert.strictEqual('tokenHash' in item, false);
    }
    assert.strictEqual(
      JSON.stringify(response.body).includes('hashed-password'),
      false,
    );
  });

  test('rejects non-owner tokens', async () => {
    await request(app)
      .get('/holders')
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .expect(403);
  });
});
