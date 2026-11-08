import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { User as UserInterface } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_TOKEN,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

interface UserSeed {
  username: string;
  email?: string;
}

const createUsers = (seeds: UserSeed[]) =>
  fixture.createMany<UserInterface>(
    'User',
    seeds.map(({ username, email }) => ({
      _id: new Types.ObjectId(),
      email: email ?? generateRandomEmail('list'),
      username,
    })),
  );

describe('E2E Test: Find All Users', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('AC-1: returns the paginated envelope and the total', async () => {
    const users = await createUsers([
      { username: 'list-user-1' },
      { username: 'list-user-2' },
      { username: 'list-user-3' },
    ]);

    const response = await request(app)
      .get('/users')
      .query({ page: 1, limit: 2 })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(response.body.items.length, 2);
    assert.strictEqual(response.body.total, users.length);
    assert.strictEqual(response.body.page, 1);
    assert.strictEqual(response.body.limit, 2);
    assert.ok(response.body.items[0]._id);

    const secondPage = await request(app)
      .get('/users')
      .query({ page: 2, limit: 2 })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(secondPage.body.items.length, 1);
    assert.strictEqual(secondPage.body.total, users.length);
    assert.strictEqual(secondPage.body.page, 2);
  });

  test('AC-2: searches by email and username prefix and reflects it in the total', async () => {
    await createUsers([
      { username: 'alice-user', email: generateRandomEmail('alice') },
      { username: 'ali-baba' },
      { username: 'carol-user' },
    ]);

    const response = await request(app)
      .get('/users')
      .query({ q: 'ali' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(response.body.total, 2);
    assert.deepStrictEqual(
      response.body.items
        .map((user: UserInterface) => user.username)
        .sort((a: string, b: string) => a.localeCompare(b)),
      ['ali-baba', 'alice-user'],
    );
  });

  test('AC-3: clamps the limit, rejects invalid pages and escapes metacharacters', async () => {
    await createUsers([{ username: 'metachar-user' }]);

    const clamped = await request(app)
      .get('/users')
      .query({ limit: 1000 })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    assert.strictEqual(clamped.body.limit, 100);

    for (const query of [{ page: -1 }, { page: 0 }, { limit: 'abc' }]) {
      const response = await request(app)
        .get('/users')
        .query(query)
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .expect(400);
      assert.strictEqual(response.body.code, 'INVALID_ARGUMENT');
    }

    const literal = await request(app)
      .get('/users')
      .query({ q: '.*' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    assert.strictEqual(literal.body.total, 0);
    assert.deepStrictEqual(literal.body.items, []);
  });

  test('AC-4: keeps the owner-only authorization', async () => {
    await request(app)
      .get('/users')
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .expect(403);

    await request(app).get('/users').expect(401);
  });

  test('AC-5: never exposes credentials, lockout counters or MFA fields', async () => {
    await createUsers([{ username: 'safe-user' }]);

    const response = await request(app)
      .get('/users')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    const item = response.body.items[0];
    assert.strictEqual(item.password, undefined);
    assert.strictEqual(item.loginAttempts, undefined);
    assert.strictEqual(item.lockoutUntil, undefined);
    assert.strictEqual(item.mfaSecret, undefined);
    assert.strictEqual(item.mfaPendingSecret, undefined);
    assert.strictEqual(item.mfaRecoveryCodes, undefined);
    assert.strictEqual(item.mfaFailedAttempts, undefined);
    assert.strictEqual(item.mfaLockoutUntil, undefined);
    assert.strictEqual(item.mfaLastUsedStep, undefined);
  });

  test('orders by the requested field with a stable tie break', async () => {
    await createUsers([{ username: 'zeta-user' }, { username: 'alpha-user' }]);

    const response = await request(app)
      .get('/users')
      .query({ sort: 'username:asc' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.deepStrictEqual(
      response.body.items.map((user: UserInterface) => user.username),
      ['alpha-user', 'zeta-user'],
    );
  });

  test('returns an empty envelope when there is no user', async () => {
    const response = await request(app)
      .get('/users')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.deepStrictEqual(response.body, {
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
  });
});
