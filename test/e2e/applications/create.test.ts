import { Application } from 'express';
import request from 'supertest';

import {
  DEFAULT_ADMIN_TOKEN,
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_TOKEN,
} from '../../fixtures/defaults';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { getTestAppInstance } from '../../utils/app';

const authorization = (token: string) => `Bearer ${token}`;

describe('E2E Applications administration', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should let the owner create and read an application', async () => {
    const application = ApplicationFactory.generate();

    const created = await request(app)
      .post('/applications')
      .set('Authorization', authorization(DEFAULT_OWNER_TOKEN))
      .send({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
      })
      .expect(201);

    assert.strictEqual(created.body.slug, application.slug);
    assert.strictEqual(created.body.active, true);

    const fetched = await request(app)
      .get(`/applications/${created.body._id}`)
      .set('Authorization', authorization(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(fetched.body.audience, application.audience);

    const list = await request(app)
      .get('/applications')
      .set('Authorization', authorization(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.ok(
      (list.body as { slug: string }[]).some(
        (item) => item.slug === application.slug,
      ),
    );
  });

  test('should reject duplicated slug and audience', async () => {
    const application = ApplicationFactory.generate();
    const payload = {
      name: application.name,
      slug: application.slug,
      audience: application.audience,
    };

    await request(app)
      .post('/applications')
      .set('Authorization', authorization(DEFAULT_OWNER_TOKEN))
      .send(payload)
      .expect(201);

    const duplicateSlug = await request(app)
      .post('/applications')
      .set('Authorization', authorization(DEFAULT_OWNER_TOKEN))
      .send({ ...payload, audience: `${payload.audience}-other` })
      .expect(400);

    assert.strictEqual(duplicateSlug.body.code, 'ENTITY_ALREADY_EXISTS');

    const duplicateAudience = await request(app)
      .post('/applications')
      .set('Authorization', authorization(DEFAULT_OWNER_TOKEN))
      .send({ ...payload, slug: `${payload.slug}-other` })
      .expect(400);

    assert.strictEqual(duplicateAudience.body.code, 'ENTITY_ALREADY_EXISTS');
  });

  test('should validate the application payload', async () => {
    const application = ApplicationFactory.generate();

    await request(app)
      .post('/applications')
      .set('Authorization', authorization(DEFAULT_OWNER_TOKEN))
      .send({ slug: application.slug, audience: application.audience })
      .expect(400);

    await request(app)
      .post('/applications')
      .set('Authorization', authorization(DEFAULT_OWNER_TOKEN))
      .send({
        name: application.name,
        slug: 'Not A Slug!',
        audience: application.audience,
      })
      .expect(400);
  });

  test('should return 403 for non-owner roles', async () => {
    const application = ApplicationFactory.generate();

    for (const token of [DEFAULT_ADMIN_TOKEN, DEFAULT_USER_TOKEN]) {
      await request(app)
        .post('/applications')
        .set('Authorization', authorization(token))
        .send({
          name: application.name,
          slug: application.slug,
          audience: application.audience,
        })
        .expect(403);
    }
  });

  test('should require authentication', async () => {
    await request(app).get('/applications').expect(401);
  });

  test('should return 404 for an unknown application', async () => {
    await request(app)
      .get('/applications/64b64c4f4f4f4f4f4f4f4f4f')
      .set('Authorization', authorization(DEFAULT_OWNER_TOKEN))
      .expect(404);
  });
});
