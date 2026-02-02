import request from 'supertest';
import { Application } from 'express';
import { getTestAppInstance } from '../../utils/app';
import fixture from '../../fixtures/fixture';
import {
  DEFAULT_ADMIN_TOKEN,
  DEFAULT_USER_TOKEN,
} from '../../fixtures/defaults';

describe('E2E Test: Find All Users', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should retrieve all users', async () => {
    const users = await fixture.createMany('User', [
      { email: 'alice@example.com' },
      { email: 'bob@example.com' },
    ]);

    const response = await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${DEFAULT_ADMIN_TOKEN}`)
      .expect(200);

    assert.strictEqual(response.body.length, users.length);
    assert.strictEqual(response.body[0].email, 'alice@example.com');
  });

  test('should return an empty array when no users exist', async () => {
    const response = await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${DEFAULT_ADMIN_TOKEN}`)
      .expect(200);

    assert.deepStrictEqual(response.body, []);
  });

  test('should return 403 when a non-admin user attempts to retrieve all users', async () => {
    await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${DEFAULT_USER_TOKEN}`)
      .expect(403);
  });
});
