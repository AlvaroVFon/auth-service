import request from 'supertest';
import { generateRandomEmail } from '../../fixtures/defaults';
import { getTestAppInstance } from '../../utils/app';
import { Application } from 'express';
import { Types } from 'mongoose';
import { DEFAULT_USER_TOKEN } from '../../fixtures/defaults';

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
      .set('Authorization', `Bearer ${DEFAULT_USER_TOKEN}`)
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
      .set('Authorization', `Bearer ${DEFAULT_USER_TOKEN}`)
      .set('Accept', 'application/json')
      .expect(400);

    assert.strictEqual(response.body.code, 'INVALID_ARGUMENT');
    assert.ok(response.body.message.includes('Invalid email format'));
  });

  test('should handle error if no body is sent', async () => {
    const response = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${DEFAULT_USER_TOKEN}`)
      .set('Accept', 'application/json')
      .expect(400);

    assert.ok(response.body.message.includes('Request body is required'));
  });
});
