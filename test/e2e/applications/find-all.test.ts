import { Application as ExpressApplication } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application } from '../../../src/applications/applications.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_TOKEN,
} from '../../fixtures/defaults';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

interface ApplicationSeed {
  name?: string;
  slug?: string;
}

describe('E2E Applications catalog listing', () => {
  let app: ExpressApplication;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createApplications = (seeds: ApplicationSeed[] = [{}]) =>
    fixture.createMany<Application>(
      'Application',
      seeds.map(({ name, slug }) => ({
        ...ApplicationFactory.generate({
          ...(name === undefined ? {} : { name }),
          ...(slug === undefined ? {} : { slug }),
        }),
        _id: new Types.ObjectId(),
      })),
    );

  test('AC-1: returns the paginated envelope and the total', async () => {
    await createApplications([{}, {}, {}]);

    const response = await request(app)
      .get('/applications')
      .query({ page: 2, limit: 2 })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(response.body.items.length, 1);
    assert.strictEqual(response.body.total, 3);
    assert.strictEqual(response.body.page, 2);
    assert.strictEqual(response.body.limit, 2);
  });

  test('AC-2: searches by name or slug prefix and reflects it in the total', async () => {
    await createApplications([{ name: 'Acme portal' }]);
    await createApplications([{ name: 'Another', slug: 'acme-slug' }]);
    await createApplications([{ name: 'Other application' }]);

    const response = await request(app)
      .get('/applications')
      .query({ q: 'acme' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(response.body.total, 2);
    assert.ok(
      response.body.items.some(
        (application: Application) =>
          application.slug === 'acme-slug' || /^acme/i.test(application.name),
      ),
    );
    assert.ok(
      response.body.items.every(
        (application: Application) =>
          application.slug === 'acme-slug' || /^acme/i.test(application.name),
      ),
    );
  });

  test('AC-3: clamps the limit and rejects invalid parameters and sorts', async () => {
    await createApplications();

    const clamped = await request(app)
      .get('/applications')
      .query({ limit: 1000 })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    assert.strictEqual(clamped.body.limit, 100);

    for (const query of [{ page: -1 }, { page: 0 }, { limit: 'abc' }]) {
      const response = await request(app)
        .get('/applications')
        .query(query)
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .expect(400);
      assert.strictEqual(response.body.code, 'INVALID_ARGUMENT');
    }

    const invalidSort = await request(app)
      .get('/applications')
      .query({ sort: 'password:asc' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(400);
    assert.strictEqual(invalidSort.body.code, 'INVALID_ARGUMENT');
  });

  test('AC-4: keeps a stable order across pages and requests', async () => {
    await createApplications([
      { name: 'Same name' },
      { name: 'Same name' },
      { name: 'Same name' },
    ]);

    const page = (pageNumber: number) =>
      request(app)
        .get('/applications')
        .query({ sort: 'name:asc', page: pageNumber, limit: 1 })
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .expect(200);

    const firstPage = await page(1);
    const secondPage = await page(2);
    const repeatedFirstPage = await page(1);

    const firstId = firstPage.body.items[0]._id as string;
    const secondId = secondPage.body.items[0]._id as string;

    // The `_id` tie break keeps equal names in a deterministic order, so the
    // same row cannot appear twice or be skipped between pages.
    assert.notStrictEqual(firstId, secondId);
    assert.strictEqual(firstId < secondId, true);
    assert.deepStrictEqual(
      repeatedFirstPage.body.items.map(
        (application: Application) => application._id,
      ),
      [firstId],
    );
  });

  test('AC-5: keeps the owner-only authorization', async () => {
    await request(app)
      .get('/applications')
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .expect(403);

    await request(app).get('/applications').expect(401);
  });

  test('returns an empty envelope when there is no application', async () => {
    const response = await request(app)
      .get('/applications')
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
