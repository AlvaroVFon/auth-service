import request from 'supertest';
import { getTestAppInstance } from '../../utils/app';
import { Application } from 'express';
import fixture from '../../fixtures';
import {
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { JWT_REGEX } from '../../../src/common/constants/regex';
import { BlacklistedToken } from '../../../src/auth/tokens/blacklisted-token.interface';

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

  test('should reject blacklisted access token after logout', async () => {
    const { accessToken } = await signupAndLogin();

    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    // The same access token should now be blacklisted and rejected
    const response = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    assert.strictEqual(response.body.message, 'Invalid token payload');
    assert.strictEqual(response.body.code, 'INVALID_CREDENTIALS');
  });

  test('should revoke refresh tokens after logout', async () => {
    const { accessToken, refreshToken, email } = await signupAndLogin();

    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    // Login again to get a fresh access token for the refresh route
    const newLogin = await request(app)
      .post('/auth/login')
      .send({
        email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
      })
      .expect(200);

    const freshAccessToken = newLogin.body.accessToken;

    // The old refresh token should have been revoked
    const response = await request(app)
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${freshAccessToken}`)
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

  test('should store access token jti in BlacklistedToken collection after logout', async () => {
    const { accessToken } = await signupAndLogin();

    // Decode the access token to get its jti
    const payloadBase64 = accessToken.split('.')[1];
    const decoded: Record<string, unknown> = JSON.parse(
      Buffer.from(payloadBase64!, 'base64').toString(),
    );
    const jti = decoded.jti as string;

    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    // Verify a BlacklistedToken entry exists for this jti
    const entry = await fixture.findOne<BlacklistedToken>('BlacklistedToken', {
      jti,
    });
    assert.ok(
      entry,
      'Expected a BlacklistedToken entry for the access token jti',
    );
    assert.strictEqual(entry?.jti, jti);
    assert.ok(entry?.expiresAt instanceof Date);
  });
});
