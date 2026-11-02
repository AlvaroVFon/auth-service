import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import { generateRandomEmail } from '../../fixtures/defaults';
import {
  DEFAULT_ADMIN_TOKEN,
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_TOKEN,
} from '../../fixtures/defaults';
import { getTestAppInstance } from '../../utils/app';

describe('Create User E2E Test', () => {
  let app: Application;
  before(async () => {
    app = await getTestAppInstance();
  });

  test('should create a new user successfully', async () => {
    const newUser = {
      password: 'Test@1234',
      email: generateRandomEmail('e2euser'),
    };

    const response = await request(app)
      .post('/users')
      .send(newUser)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .set('Accept', 'application/json')
      .expect(201);

    const user = response.body;
    assert.ok(Types.ObjectId.isValid(user._id));
    assert.strictEqual(user.email, newUser.email);
  });

  test('should return 400 for invalid user data', async () => {
    const invalidUser = {
      password: 'short',
      email: 'not-an-email',
    };

    const response = await request(app)
      .post('/users')
      .send(invalidUser)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .set('Accept', 'application/json')
      .expect(400);

    assert.strictEqual(response.body.code, 'INVALID_ARGUMENT');
    assert.ok(response.body.message.includes('Invalid email format'));
  });

  test('should handle error if no body is sent', async () => {
    const response = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .set('Accept', 'application/json')
      .expect(400);

    assert.ok(response.body.message.includes('Request body is required'));
  });

  test('should ignore a role supplied in the body', async () => {
    const newUser = {
      password: 'Test@1234',
      email: generateRandomEmail('roleinjection'),
      role: 'owner',
    };

    const response = await request(app)
      .post('/users')
      .send(newUser)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .expect(201);

    assert.strictEqual(response.body.role, 'user');
  });

  test('should return 403 for the legacy admin role', async () => {
    const response = await request(app)
      .post('/users')
      .send({
        password: 'Test@1234',
        email: generateRandomEmail('legacyadmin'),
      })
      .set('Authorization', `Bearer ${DEFAULT_ADMIN_TOKEN}`)
      .expect(403);

    assert.ok(response.body.message.includes('Access denied'));
  });

  test('should return 403 when a non-admin user tries to create a user', async () => {
    const newUser = {
      password: 'Test@1234',
      email: generateRandomEmail('nonadminuser'),
    };

    const response = await request(app)
      .post('/users')
      .send(newUser)
      .set('Authorization', `Bearer ${DEFAULT_USER_TOKEN}`)
      .set('Accept', 'application/json')
      .expect(403);

    assert.ok(response.body.message.includes('Access denied'));
  });
});
