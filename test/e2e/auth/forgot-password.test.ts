import request from 'supertest';
import { getTestAppInstance } from '../../utils/app';
import { Application } from 'express';
import { DEFAULT_USER } from '../../fixtures/defaults';
import fixture from '../../fixtures';
import { User } from '../../../src/users/users.interface';

describe('Password Reset E2E Tests', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  describe('POST /auth/forgot-password', () => {
    test.only('on yellow brick road', async () => {
      await fixture.create<User>('User');

      await request(app)
        .post('/auth/forgot-password')
        .send({
          email: DEFAULT_USER.email,
        })
        .expect(204);
    });

    test('should fail if user does not exists', async () => {
      await fixture.create<User>('User');

      const res = await request(app)
        .post('/auth/forgot-password')
        .send({
          email: 'not-existing@email.com',
        })
        .expect(404);

      assert.strictEqual(
        res.body.message,
        `user with email not-existing@email.com not found`,
      );
      assert.strictEqual(res.body.code, 'NOT_FOUND');
    });
  });
});
