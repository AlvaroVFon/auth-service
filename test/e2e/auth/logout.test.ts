import request from 'supertest';
import { getTestAppInstance } from '../../utils/app';
import { Application } from 'express';
import { generateRandomEmail } from '../../fixtures/defaults';
import { JWT_REGEX } from '../../../src/common/constants/regex';

describe('E2E Auth Logout', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should logout an authenticated user successfully', async () => {
    const singupCredentials = {
      email: generateRandomEmail('login'),
      password: 'SecurePass123!',
      passwordConfirmation: 'SecurePass123!',
    };

    await request(app).post('/auth/signup').send(singupCredentials).expect(201);

    const loginCredentials = {
      email: singupCredentials.email,
      password: 'SecurePass123!',
    };

    const loginResponse = await request(app)
      .post('/auth/login')
      .send(loginCredentials)
      .expect(200);

    const responseBody = loginResponse.body;

    assert.ok(responseBody.accessToken);
    assert.ok(JWT_REGEX.test(responseBody.accessToken));
    assert.strictEqual(typeof responseBody.accessToken, 'string');

    const accessToken = responseBody.accessToken;

    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
  });

  test('should fail logout without authentication', async () => {
    await request(app).post('/auth/logout').expect(401);
  });
});
