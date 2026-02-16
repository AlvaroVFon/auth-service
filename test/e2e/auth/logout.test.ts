import request from 'supertest';
import { getTestAppInstance } from '../../utils/app';
import { Application } from 'express';
import { generateRandomEmail } from '../../fixtures/defaults';
import { JWT_REGEX } from '../../../src/common/constants/regex';
import fixture from '../../fixtures/fixture';

describe('E2E Auth Logout', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should logout an authenticated user successfully', async () => {
    const singupCredentials = {
      email: generateRandomEmail('login'),
      password: 'StrongPassword123!',
      passwordConfirmation: 'StrongPassword123!',
    };

    const signupResponse = await request(app)
      .post('/auth/signup')
      .send(singupCredentials)
      .expect(201);

    const holderId = signupResponse.body._id;
    const codeDoc: any = await fixture.findOne('Code', { holderId });

    await request(app)
      .post('/auth/verify')
      .query({ holderId })
      .send({ code: codeDoc.code })
      .expect(204);

    const loginCredentials = {
      email: singupCredentials.email,
      password: 'StrongPassword123!',
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
