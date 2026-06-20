import request from 'supertest';
import jwt from 'jsonwebtoken';
import { getTestAppInstance } from '../../utils/app';
import fixture from '../../fixtures';
import { Application } from 'express';
import {
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { User } from '../../../src/users/users.interface';
import { RefreshToken } from '../../../src/auth/tokens/refresh-token.interface';
import { JWT_REGEX } from '../../../src/common/constants/regex';

describe('E2E Auth Login', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should login an existing user successfully', async () => {
    const user = await fixture.create<User>('User');

    const loginCredentials = {
      email: user.email,
      password: DEFAULT_USER_PLAIN_PASSWORD,
    };

    const response = await request(app)
      .post('/auth/login')
      .send(loginCredentials)
      .expect(200);

    const responseBody = response.body;

    assert.ok(responseBody.accessToken);
    assert.ok(JWT_REGEX.test(responseBody.accessToken));
    assert.strictEqual(typeof responseBody.accessToken, 'string');
  });

  test('should fail login with incorrect password', async () => {
    const signupCredentials = {
      email: generateRandomEmail('login-fail'),
      password: 'StrongPassword123!',
      passwordConfirmation: 'StrongPassword123!',
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

    const loginCredentials = {
      email: signupCredentials.email,
      password: 'WrongPassword123!',
    };

    const response = await request(app)
      .post('/auth/login')
      .send(loginCredentials)
      .expect(401);

    assert.strictEqual(response.body.message, 'Invalid email or password');
  });

  test('should fail login with non-existing email', async () => {
    const loginCredentials = {
      email: generateRandomEmail('non-existing'),
      password: 'SomePassword123!',
    };

    const response = await request(app)
      .post('/auth/login')
      .send(loginCredentials)
      .expect(401);

    assert.strictEqual(response.body.message, 'Invalid email or password');
  });

  test('should fail login with invalid email format', async () => {
    const loginCredentials = {
      email: 'invalid-email-format',
      password: 'SomePassword123!',
    };

    const response = await request(app)
      .post('/auth/login')
      .send(loginCredentials)
      .expect(400);

    assert.strictEqual(response.body.message, 'Invalid email or password');
  });

  test('should generate two different tokens for subsequent logins', async () => {
    const signupCredentials = {
      email: generateRandomEmail('login-multiple'),
      password: 'StrongPassword123!',
      passwordConfirmation: 'StrongPassword123!',
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

    const loginCredentials = {
      email: signupCredentials.email,
      password: 'StrongPassword123!',
    };

    const firstResponse = await request(app)
      .post('/auth/login')
      .send(loginCredentials)
      .expect(200);

    const secondResponse = await request(app)
      .post('/auth/login')
      .send(loginCredentials)
      .expect(200);

    const firstToken = firstResponse.body.accessToken;
    const secondToken = secondResponse.body.accessToken;

    assert.ok(firstToken);
    assert.ok(secondToken);
    assert.notStrictEqual(firstToken, secondToken);
  });

  test('should return 423 when account is locked', async () => {
    const user = await fixture.create<User>('User', {
      loginAttempts: 5,
      lockoutUntil: new Date(Date.now() + 60000),
    });

    const loginCredentials = {
      email: user.email,
      password: DEFAULT_USER_PLAIN_PASSWORD,
    };

    const response = await request(app)
      .post('/auth/login')
      .send(loginCredentials)
      .expect(423);

    assert.strictEqual(
      response.body.message,
      'Account is temporarily locked. Please try again later.',
    );
    assert.strictEqual(response.body.code, 'ACCOUNT_LOCKED');
  });

  test('should login successfully after lockout expiry', async () => {
    const user = await fixture.create<User>('User', {
      loginAttempts: 5,
      lockoutUntil: new Date(Date.now() - 1000),
    });

    const loginCredentials = {
      email: user.email,
      password: DEFAULT_USER_PLAIN_PASSWORD,
    };

    const response = await request(app)
      .post('/auth/login')
      .send(loginCredentials)
      .expect(200);

    assert.ok(response.body.accessToken);
    assert.strictEqual(typeof response.body.accessToken, 'string');
    assert.ok(JWT_REGEX.test(response.body.accessToken));
  });

  test('should store IP and User-Agent from request headers in the refresh token', async () => {
    const user = await fixture.create<User>('User');

    const loginCredentials = {
      email: user.email,
      password: DEFAULT_USER_PLAIN_PASSWORD,
    };

    const response = await request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', '203.0.113.1')
      .set('User-Agent', 'Mozilla/5.0')
      .send(loginCredentials)
      .expect(200);

    const decoded = jwt.decode(response.body.refreshToken) as { jti: string };
    assert.ok(decoded?.jti);

    const storedToken = await fixture.findOne<RefreshToken>('RefreshToken', {
      jti: decoded.jti,
    });

    assert.ok(storedToken);
    assert.strictEqual(storedToken?.ipAddress, '203.0.113.1');
    assert.strictEqual(storedToken?.userAgent, 'Mozilla/5.0');
  });
});
