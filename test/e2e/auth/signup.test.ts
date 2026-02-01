import request from 'supertest';
import { getTestAppInstance } from '../../utils/app';
import fixture from '../../fixtures/fixture';
import { Application } from 'express';
import { generateRandomEmail } from '../../fixtures/defaults';
import { User } from '../../../src/users/users.interface';

describe('E2E Auth Signup', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should signup a new user successfully', async () => {
    const signupCredentials = {
      email: generateRandomEmail('signup'),
      password: 'StrongPassword123!',
      passwordConfirmation: 'StrongPassword123!',
    };

    const response = await request(app)
      .post('/auth/signup')
      .send(signupCredentials)
      .expect(201);

    const newUser = response.body;

    assert.ok(newUser._id);
    assert.strictEqual(newUser.email, signupCredentials.email);
    assert.strictEqual(newUser.password, undefined);
  });

  test('should fail signup with existing email', async () => {
    const existingUser = await fixture.create<User>('User');

    const signupCredentials = {
      email: existingUser.email,
      password: 'AnotherStrongPassword123!',
      passwordConfirmation: 'AnotherStrongPassword123!',
    };

    const response = await request(app)
      .post('/auth/signup')
      .send(signupCredentials)
      .expect(400);

    assert.strictEqual(response.body.message, 'Invalid email or password');
  });

  test('should fail signup with invalid email format', async () => {
    const signupCredentials = {
      email: 'invalid-email-format',
      password: 'StrongPassword123!',
      passwordConfirmation: 'StrongPassword123!',
    };

    const response = await request(app)
      .post('/auth/signup')
      .send(signupCredentials)
      .expect(400);

    assert.strictEqual(response.body.message, 'Invalid email format');
  });

  test('should fail signup when password and confirmation do not match', async () => {
    const signupCredentials = {
      email: generateRandomEmail('signup'),
      password: 'StrongPassword123!',
      passwordConfirmation: 'DifferentPassword123!',
    };

    const response = await request(app)
      .post('/auth/signup')
      .send(signupCredentials)
      .expect(400);

    assert.strictEqual(
      response.body.message,
      'Password and password confirmation do not match',
    );
  });

  test('should fail signup with weak password', async () => {
    const signupCredentials = {
      email: generateRandomEmail('signup'),
      password: 'weak',
      passwordConfirmation: 'weak',
    };

    const response = await request(app)
      .post('/auth/signup')
      .send(signupCredentials)
      .expect(400);

    assert.strictEqual(
      response.body.message,
      'Password does not meet complexity requirements',
    );
  });

  test('should fail signup with missing email', async () => {
    const signupCredentials = {
      email: '',
      password: 'StrongPassword123!',
      passwordConfirmation: 'StrongPassword123!',
    };

    const response = await request(app)
      .post('/auth/signup')
      .send(signupCredentials)
      .expect(400);

    assert.strictEqual(response.body.message, 'Email is required');
  });

  test('should fail signup with missing password', async () => {
    const signupCredentials = {
      email: generateRandomEmail('signup'),
      password: '',
      passwordConfirmation: '',
    };

    const response = await request(app)
      .post('/auth/signup')
      .send(signupCredentials)
      .expect(400);

    assert.strictEqual(response.body.message, 'Password is required');
  });

  test('should fail signup with missing password confirmation', async () => {
    const signupCredentials = {
      email: generateRandomEmail('signup'),
      password: 'StrongPassword123!',
      passwordConfirmation: '',
    };

    const response = await request(app)
      .post('/auth/signup')
      .send(signupCredentials)
      .expect(400);

    assert.strictEqual(
      response.body.message,
      'Password confirmation is required',
    );
  });
});
