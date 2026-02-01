import request from 'supertest';
import { getTestAppInstance } from '../../utils/app';
import fixture from '../../fixtures/fixture';
import { Application } from 'express';
import { generateRandomEmail } from '../../fixtures/defaults';
import { User } from '../../../src/users/users.interface';
import { JWT_REGEX } from '../../../src/common/constants/regex';

describe('E2E Auth Login', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should login an existing user successfully', async () => {
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
      password: 'CorrectPassword123!',
      passwordConfirmation: 'CorrectPassword123!',
    };

    await request(app).post('/auth/signup').send(signupCredentials).expect(201);

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
      password: 'UniquePass123!',
      passwordConfirmation: 'UniquePass123!',
    };

    await request(app).post('/auth/signup').send(signupCredentials).expect(201);

    const loginCredentials = {
      email: signupCredentials.email,
      password: 'UniquePass123!',
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
});
