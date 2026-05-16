import request from 'supertest';
import { getTestAppInstance } from '../../utils/app';
import { Application } from 'express';
import fixture from '../../fixtures';
import {
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { JWT_REGEX } from '../../../src/common/constants/regex';

describe('E2E Auth Logout', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  async function signupAndLogin() {
    const signupCredentials = {
      email: generateRandomEmail('logout'),
      password: DEFAULT_USER_PLAIN_PASSWORD,
      passwordConfirmation: DEFAULT_USER_PLAIN_PASSWORD,
    };

    const signupResponse = await request(app)
      .post('/auth/signup')
      .send(signupCredentials)
      .expect(201);

    const holderId = signupResponse.body._id;

    const codeDoc: any = await fixture.findOne('Code', { holderId });
    await request(app)
      .post('/auth/verify')
      .query({ holderId })
      .send({ code: codeDoc.code })
      .expect(204);

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({
        email: signupCredentials.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
      })
      .expect(200);

    return {
      accessToken: loginResponse.body.accessToken,
      refreshToken: loginResponse.body.refreshToken,
      email: signupCredentials.email,
    };
  }

  test('should logout successfully with valid access token', async () => {
    const { accessToken } = await signupAndLogin();

    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
  });

  test('should fail logout without authorization header', async () => {
    const response = await request(app).post('/auth/logout').expect(401);

    assert.strictEqual(
      response.body.message,
      'Invalid or missing authorization header',
    );
    assert.strictEqual(response.body.code, 'INVALID_CREDENTIALS');
  });

  test('should fail logout with invalid access token', async () => {
    const response = await request(app)
      .post('/auth/logout')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    assert.strictEqual(
      response.body.message,
      'InvalidTokenError: Token is invalid or has expired',
    );
    assert.strictEqual(response.body.code, 'INVALID_TOKEN');
  });

  test('should allow logout without body', async () => {
    const { accessToken } = await signupAndLogin();

    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(204);
  });

  test('should revoke refresh tokens after logout', async () => {
    const { accessToken, refreshToken } = await signupAndLogin();

    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const response = await request(app)
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(401);

    assert.strictEqual(response.body.message, 'Refresh token has been revoked');
    assert.strictEqual(response.body.code, 'UNAUTHORIZED');
  });

  test('should be able to login again after logout', async () => {
    const { accessToken, email } = await signupAndLogin();

    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({
        email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
      })
      .expect(200);

    assert.ok(loginResponse.body.accessToken);
    assert.ok(JWT_REGEX.test(loginResponse.body.accessToken));
    assert.ok(loginResponse.body.refreshToken);
  });
});
