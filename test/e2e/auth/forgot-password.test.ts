import { Application } from 'express';
import request from 'supertest';

import { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import { DEFAULT_USER } from '../../fixtures/defaults';
import { getTestAppInstance } from '../../utils/app';

describe('Password Reset E2E Tests', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  describe('POST /auth/forgot-password', () => {
    test('on yellow brick road', async () => {
      await fixture.create<User>('User');

      await request(app)
        .post('/auth/forgot-password')
        .send({
          email: DEFAULT_USER.email,
        })
        .expect(204);
    });

    test('should not reveal whether the user exists', async () => {
      await fixture.create<User>('User');

      await request(app)
        .post('/auth/forgot-password')
        .send({
          email: 'not-existing@email.com',
        })
        .expect(204);
    });
  });
});
