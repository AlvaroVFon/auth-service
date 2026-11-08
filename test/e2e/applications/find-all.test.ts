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
}

describe('E2E Applications catalog listing', () => {
  let app: ExpressApplication;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createApplications = (seeds: ApplicationSeed[] = [{}]) =>
    fixture.createMany<Application>(
      'Application',
      seeds.map(({ name }) => ({
        ...ApplicationFactory.generate(name === undefined ? {} : { name }),
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
    await createApplications([{ name: 'Acme portal' }, { name: 'acme labs' }]);
    await createApplications([{ name: 'Other application' }]);

    const response = await request(app)
      .get('/applications')
      .query({ q: 'acme' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(response.body.total, 2);
    for (const application of response.body.items) {
      assert.match(application.name, /^acme/i);
    }
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

  test('AC-4: keeps a stable order across identical requests', async () => {
    await createApplications([{ name: 'Same name' }]);
    await createApplications([{ name: 'Same name' }]);

    const first = await request(app)
      .get('/applications')
      .query({ sort: 'name:asc' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    const second = await request(app)
      .get('/applications')
      .query({ sort: 'name:asc' })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.deepStrictEqual(
      first.body.items.map((application: Application) => application._id),
      second.body.items.map((application: Application) => application._id),
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
