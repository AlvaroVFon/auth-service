import request from 'supertest';
import { getTestAppInstance } from '../../utils/app';
import { Application } from 'express';
import fixture from '../../fixtures/fixture';
import {
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { User } from '../../../src/users/users.interface';
import { JWT_REGEX } from '../../../src/common/constants/regex';

describe('E2E Auth Refresh Token', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  async function signupAndLogin() {
    const signupCredentials = {
      email: generateRandomEmail('refresh'),
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

  test('should refresh tokens with valid access token and refresh token', async () => {
    const { accessToken, refreshToken } = await signupAndLogin();

    const response = await request(app)
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    assert.ok(response.body.accessToken);
    assert.ok(JWT_REGEX.test(response.body.accessToken));
    assert.ok(response.body.refreshToken);
    assert.ok(JWT_REGEX.test(response.body.refreshToken));
    assert.notStrictEqual(response.body.accessToken, accessToken);
    assert.notStrictEqual(response.body.refreshToken, refreshToken);
  });

  test('should fail refresh without authorization header', async () => {
    const { refreshToken } = await signupAndLogin();

    const response = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    assert.strictEqual(
      response.body.message,
      'Invalid or missing authorization header',
    );
  });

  test('should fail refresh with invalid access token', async () => {
    const { refreshToken } = await signupAndLogin();

    const response = await request(app)
      .post('/auth/refresh')
      .set('Authorization', 'Bearer invalid-token')
      .send({ refreshToken })
      .expect(401);

    assert.strictEqual(
      response.body.message,
      'InvalidTokenError: Token is invalid or has expired',
    );
    assert.strictEqual(response.body.code, 'INVALID_TOKEN');
  });

  test('should fail refresh with missing refresh token in body', async () => {
    const { accessToken } = await signupAndLogin();

    const response = await request(app)
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(400);

    assert.strictEqual(response.body.message, 'Request body is required.');
  });

  test('should fail refresh with invalid refresh token', async () => {
    const { accessToken } = await signupAndLogin();

    const response = await request(app)
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken: 'invalid-refresh-token' })
      .expect(401);

    assert.strictEqual(
      response.body.message,
      'InvalidTokenError: Token is invalid or has expired',
    );
    assert.strictEqual(response.body.code, 'INVALID_TOKEN');
  });

  test('should fail refresh with revoked refresh token', async () => {
    const { accessToken, refreshToken } = await signupAndLogin();

    await request(app)
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    const response = await request(app)
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(401);

    assert.strictEqual(response.body.message, 'Refresh token has been revoked');
    assert.strictEqual(response.body.code, 'UNAUTHORIZED');
  });

  test('should generate new tokens that can be used for subsequent refresh', async () => {
    const { accessToken, refreshToken } = await signupAndLogin();

    const firstRefresh = await request(app)
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    const secondRefresh = await request(app)
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${firstRefresh.body.accessToken}`)
      .send({ refreshToken: firstRefresh.body.refreshToken })
      .expect(200);

    assert.ok(secondRefresh.body.accessToken);
    assert.ok(secondRefresh.body.refreshToken);
    assert.notStrictEqual(
      secondRefresh.body.accessToken,
      firstRefresh.body.accessToken,
    );
  });
});
