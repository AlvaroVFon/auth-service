import { getTestAppInstance } from '../../utils/app';
import request from 'supertest';
import { Application } from 'express';
import { Types } from 'mongoose';
import { generateRandomEmail } from '../../fixtures/defaults';
import fixture from '../../fixtures/fixture';
import { User } from '../../../src/users/users.interface';
import {
  DEFAULT_ADMIN_TOKEN,
  DEFAULT_USER_TOKEN,
} from '../../fixtures/defaults';

describe('Get User By ID E2E Test', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should retrieve the user by ID successfully', async () => {
    const email = generateRandomEmail('getbyid');
    const user = await fixture.create<User>('User', {
      email,
    });
    const response = await request(app)
      .get(`/users/${user._id.toString()}`)
      .set('Authorization', `Bearer ${DEFAULT_ADMIN_TOKEN}`)
      .set('Accept', 'application/json')
      .expect(200);

    assert.strictEqual(response.body.email, email);
    assert.ok(Types.ObjectId.isValid(response.body._id));
  });

  test('should return 400 for invalid user ID format', async () => {
    const invalidUserId = 'invalid-id-format';

    const response = await request(app)
      .get(`/users/${invalidUserId}`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${DEFAULT_ADMIN_TOKEN}`)
      .expect(400);

    assert.strictEqual(response.body.code, 'INVALID_ARGUMENT');
    assert.ok(response.body.message.includes('Invalid ID format'));
  });

  test('should return 404 for non-existing user ID', async () => {
    const nonExistingUserId = new Types.ObjectId().toString();

    const response = await request(app)
      .get(`/users/${nonExistingUserId}`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${DEFAULT_ADMIN_TOKEN}`)
      .expect(404);

    assert.strictEqual(response.body.code, 'NOT_FOUND');
    assert.ok(response.body.message.includes('User not found'));
  });

  test('should return 403 when a non-admin user attempts to retrieve a user by ID', async () => {
    const email = generateRandomEmail('getbyidnonadmin');
    const user = await fixture.create<User>('User', {
      email,
    });

    await request(app)
      .get(`/users/${user._id.toString()}`)
      .set('Authorization', `Bearer ${DEFAULT_USER_TOKEN}`)
      .expect(403);
  });
});
