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

interface HolderSeed {
  email: string;
  createdAt?: Date;
  expiresAt?: Date;
}

const createHolders = (seeds: HolderSeed[]) =>
  fixture.createMany<Holder>(
    'Holder',
    seeds.map(({ email, createdAt, expiresAt }) => ({
      email,
      password: 'hashed-password',
      expiresAt: expiresAt ?? new Date(Date.now() + 60_000),
      ...(createdAt === undefined ? {} : { createdAt }),
    })),
  );

describe('E2E holders listing', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('lists the pending holders in the shared envelope without secrets', async () => {
    await createHolders([
      { email: generateRandomEmail('holder-a+') },
      { email: generateRandomEmail('holder-b+') },
    ]);

    const response = await request(app)
      .get('/holders')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(response.body.total, 2);
    assert.strictEqual(response.body.items.length, 2);
    assert.strictEqual(response.body.page, 1);
    assert.strictEqual(response.body.limit, 20);

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

  test('filters by email prefix and reflects it in the total', async () => {
    await createHolders([
      { email: 'alice-holder@example.com' },
      { email: 'ali-baba@example.com' },
      { email: 'carol-holder@example.com' },
    ]);

    const response = await request(app)
      .get('/holders')
      .query({ q: 'ali' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(response.body.total, 2);
    assert.deepStrictEqual(
      response.body.items
        .map((item: Holder) => item.email)
        .sort((a: string, b: string) => a.localeCompare(b)),
      ['ali-baba@example.com', 'alice-holder@example.com'],
    );
  });

  test('paginates with page and limit', async () => {
    await createHolders([
      { email: 'page-1@example.com' },
      { email: 'page-2@example.com' },
      { email: 'page-3@example.com' },
    ]);

    const firstPage = await request(app)
      .get('/holders')
      .query({ page: 1, limit: 2, sort: 'email:asc' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(firstPage.body.items.length, 2);
    assert.strictEqual(firstPage.body.total, 3);
    assert.strictEqual(firstPage.body.page, 1);
    assert.strictEqual(firstPage.body.limit, 2);

    const secondPage = await request(app)
      .get('/holders')
      .query({ page: 2, limit: 2, sort: 'email:asc' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(secondPage.body.items.length, 1);
    assert.strictEqual(secondPage.body.total, 3);
    assert.strictEqual(secondPage.body.page, 2);
    assert.strictEqual(secondPage.body.limit, 2);
  });

  test('clamps the limit, rejects invalid pages and escapes metacharacters', async () => {
    await createHolders([{ email: 'metachar-holder@example.com' }]);

    const clamped = await request(app)
      .get('/holders')
      .query({ limit: 1000 })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    assert.strictEqual(clamped.body.limit, 100);

    for (const query of [{ page: -1 }, { page: 0 }, { limit: 'abc' }]) {
      const response = await request(app)
        .get('/holders')
        .query(query)
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .expect(400);
      assert.strictEqual(response.body.code, 'INVALID_ARGUMENT');
    }

    const literal = await request(app)
      .get('/holders')
      .query({ q: '.*' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    assert.strictEqual(literal.body.total, 0);
    assert.deepStrictEqual(literal.body.items, []);
  });

  test('orders by createdAt descending by default and validates sort', async () => {
    await createHolders([
      {
        email: 'oldest@example.com',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        email: 'newest@example.com',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        email: 'middle@example.com',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);

    const response = await request(app)
      .get('/holders')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.deepStrictEqual(
      response.body.items.map((item: Holder) => item.email),
      ['newest@example.com', 'middle@example.com', 'oldest@example.com'],
    );

    const sortedByEmail = await request(app)
      .get('/holders')
      .query({ sort: 'email:asc' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.deepStrictEqual(
      sortedByEmail.body.items.map((item: Holder) => item.email),
      ['middle@example.com', 'newest@example.com', 'oldest@example.com'],
    );

    for (const sort of ['password:asc', 'email:sideways']) {
      const invalid = await request(app)
        .get('/holders')
        .query({ sort })
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .expect(400);
      assert.strictEqual(invalid.body.code, 'INVALID_ARGUMENT');
    }
  });

  test('rejects non-owner tokens and missing credentials', async () => {
    await request(app)
      .get('/holders')
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .expect(403);

    await request(app).get('/holders').expect(401);
  });

  test('returns an empty envelope when there is no holder', async () => {
    const response = await request(app)
      .get('/holders')
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
