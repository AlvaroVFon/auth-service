import { Application } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { RefreshToken } from '../../../src/auth/tokens/refresh-token.interface';
import { JWT_REGEX } from '../../../src/common/constants/regex';
import { Grant, GrantRoles } from '../../../src/grants/grants.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { createApplicationAccess } from '../../helpers/application-access';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { GrantFactory } from '../../helpers/factories/grant.factory';
import { getTestAppInstance } from '../../utils/app';

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
    const codeDoc: any = await fixture.findOne('Code', { subjectId: holderId });

    await request(app)
      .post('/auth/verify')
      .query({ holderId })
      .send({ code: codeDoc.code })
      .expect(204);

    const user = await fixture.findOne<{ _id: string }>('User', {
      email: signupCredentials.email,
    });
    assert.ok(user);
    const { application } = await createApplicationAccess(String(user!._id));

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({
        email: signupCredentials.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    return {
      accessToken: loginResponse.body.accessToken,
      refreshToken: loginResponse.body.refreshToken,
      email: signupCredentials.email,
      application,
      userId: String(user!._id),
    };
  }

  async function createVerifiedUser(prefix: string) {
    const signupCredentials = {
      email: generateRandomEmail(prefix),
      password: DEFAULT_USER_PLAIN_PASSWORD,
      passwordConfirmation: DEFAULT_USER_PLAIN_PASSWORD,
    };

    const signupResponse = await request(app)
      .post('/auth/signup')
      .send(signupCredentials)
      .expect(201);

    const holderId = signupResponse.body._id;
    const codeDoc: any = await fixture.findOne('Code', { subjectId: holderId });

    await request(app)
      .post('/auth/verify')
      .query({ holderId })
      .send({ code: codeDoc.code })
      .expect(204);

    const user = await fixture.findOne<{ _id: string }>('User', {
      email: signupCredentials.email,
    });
    assert.ok(user);

    return { email: signupCredentials.email, userId: String(user!._id) };
  }

  test('should refresh tokens with a valid refresh token alone', async () => {
    const { refreshToken } = await signupAndLogin();

    const response = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    assert.ok(response.body.accessToken);
    assert.ok(JWT_REGEX.test(response.body.accessToken));
    assert.ok(response.body.refreshToken);
    assert.ok(JWT_REGEX.test(response.body.refreshToken));
    assert.notStrictEqual(response.body.refreshToken, refreshToken);
  });

  test('should keep the application scope on refresh', async () => {
    const { refreshToken, application } = await signupAndLogin();

    const response = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    const access = jwt.decode(response.body.accessToken) as {
      aud?: string;
      role?: string;
    };
    const refresh = jwt.decode(response.body.refreshToken) as {
      aud?: string;
    };

    assert.strictEqual(access.aud, application.audience);
    assert.strictEqual(access.role, 'viewer');
    assert.strictEqual(refresh.aud, application.audience);
  });

  test('should resolve the refresh role from the audience when a slug collides', async () => {
    const { email, userId } = await createVerifiedUser('refresh-collision');

    const applicationX = await fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate({
        slug: 'collision-x',
        audience: 'collision-shared',
      }),
    );
    const applicationY = await fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate({
        slug: 'collision-shared',
        audience: 'collision-y',
      }),
    );

    await fixture.create<Grant>(
      'Grant',
      GrantFactory.generate({
        userId: new Types.ObjectId(userId),
        applicationId: applicationX._id,
        role: GrantRoles.VIEWER,
      }),
    );
    await fixture.create<Grant>(
      'Grant',
      GrantFactory.generate({
        userId: new Types.ObjectId(userId),
        applicationId: applicationY._id,
        role: GrantRoles.ADMIN,
      }),
    );

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({
        email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: applicationX.slug,
      })
      .expect(200);

    const response = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: loginResponse.body.refreshToken })
      .expect(200);

    const access = jwt.decode(response.body.accessToken) as {
      aud?: string;
      role?: string;
    };

    assert.strictEqual(access.aud, applicationX.audience);
    assert.strictEqual(access.role, GrantRoles.VIEWER);
  });

  test('should reject a refresh token after the grant was revoked', async () => {
    const { refreshToken, userId } = await signupAndLogin();
    await fixture.deleteOne('Grant', { userId });

    await request(app).post('/auth/refresh').send({ refreshToken }).expect(403);
  });

  test('AC-3: refreshes without any access token', async () => {
    const { refreshToken } = await signupAndLogin();

    const response = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    assert.ok(response.body.accessToken);
    assert.ok(response.body.refreshToken);
  });

  test('ignores an invalid access token header', async () => {
    const { refreshToken } = await signupAndLogin();

    const response = await request(app)
      .post('/auth/refresh')
      .set('Authorization', 'Bearer invalid-token')
      .send({ refreshToken })
      .expect(200);

    assert.ok(response.body.accessToken);
  });

  test('should fail refresh with missing refresh token in body', async () => {
    await signupAndLogin();

    const response = await request(app)
      .post('/auth/refresh')
      .send({})
      .expect(400);

    assert.strictEqual(response.body.message, 'Request body is required.');
  });

  test('should fail refresh with invalid refresh token', async () => {
    await signupAndLogin();

    const response = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'invalid-refresh-token' })
      .expect(401);

    assert.strictEqual(
      response.body.message,
      'InvalidTokenError: Token is invalid or has expired',
    );
    assert.strictEqual(response.body.code, 'INVALID_TOKEN');
  });

  test('should fail refresh with revoked refresh token', async () => {
    const { refreshToken } = await signupAndLogin();

    await request(app).post('/auth/refresh').send({ refreshToken }).expect(200);

    const response = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    assert.strictEqual(response.body.message, 'Refresh token has been revoked');
    assert.strictEqual(response.body.code, 'UNAUTHORIZED');
  });

  test('should generate new tokens that can be used for subsequent refresh', async () => {
    const { refreshToken } = await signupAndLogin();

    const firstRefresh = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    const secondRefresh = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: firstRefresh.body.refreshToken })
      .expect(200);

    assert.ok(secondRefresh.body.accessToken);
    assert.ok(secondRefresh.body.refreshToken);
    assert.notStrictEqual(
      secondRefresh.body.accessToken,
      firstRefresh.body.accessToken,
    );
  });

  test('should store new IP and User-Agent on rotated refresh token', async () => {
    const { refreshToken } = await signupAndLogin();

    const refreshResponse = await request(app)
      .post('/auth/refresh')
      .set('X-Forwarded-For', '198.51.100.1')
      .set('User-Agent', 'curl/7.0')
      .send({ refreshToken })
      .expect(200);

    const decoded = jwt.decode(refreshResponse.body.refreshToken) as {
      jti: string;
    };
    assert.ok(decoded?.jti);

    const storedToken = await fixture.findOne<RefreshToken>('RefreshToken', {
      jti: decoded.jti,
    });

    assert.ok(storedToken);
    assert.strictEqual(storedToken?.ipAddress, '198.51.100.1');
    assert.strictEqual(storedToken?.userAgent, 'curl/7.0');
  });

  test('should set userAgent to null when header is missing on refresh', async () => {
    const { refreshToken } = await signupAndLogin();

    const refreshResponse = await request(app)
      .post('/auth/refresh')
      .set('X-Forwarded-For', '100.200.0.1')
      .send({ refreshToken })
      .expect(200);

    const decoded = jwt.decode(refreshResponse.body.refreshToken) as {
      jti: string;
    };
    assert.ok(decoded?.jti);

    const storedToken = await fixture.findOne<RefreshToken>('RefreshToken', {
      jti: decoded.jti,
    });

    assert.ok(storedToken);
    assert.strictEqual(storedToken?.ipAddress, '100.200.0.1');
    assert.strictEqual(storedToken?.userAgent, null);
  });
});
