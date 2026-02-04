import request from 'supertest';
import { getTestAppInstance } from '../../utils/app';
import { Application } from 'express';
import { DEFAULT_USER_TOKEN } from '../../fixtures/defaults';
import fixture from '../../fixtures/fixture';
import { User } from '../../../src/users/users.interface';

describe('Password Reset E2E Tests', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  describe('POST /auth/reset-password', () => {
    test('should reset password for authenticated user', async () => {
      await fixture.create<User>('User');
      const newPassword = 'NewP@ssw0rd123';

      await request(app)
        .post('/auth/reset-password')
        .set('Authorization', `Bearer ${DEFAULT_USER_TOKEN}`)
        .send({
          newPassword,
          passwordConfirmation: newPassword,
        })
        .expect(204);
    });

    test('should fail if password confirmation does not match', async () => {
      await fixture.create<User>('User');
      const newPassword = 'NewP@ssw0rd123';

      const res = await request(app)
        .post('/auth/reset-password')
        .set('Authorization', `Bearer ${DEFAULT_USER_TOKEN}`)
        .send({
          newPassword,
          passwordConfirmation: 'DifferentP@ssw0rd',
        })
        .expect(400);

      assert.strictEqual(
        res.body.message,
        'Password and password confirmation do not match',
      );
      assert.strictEqual(res.body.code, 'INVALID_ARGUMENT');
    });

    test('should fail if user is not authenticated', async () => {
      const newPassword = 'NewP@ssw0rd123';

      const res = await request(app)
        .post('/auth/reset-password')
        .send({
          newPassword,
          passwordConfirmation: newPassword,
        })
        .expect(401);

      assert.strictEqual(
        res.body.message,
        'Invalid or missing authorization header',
      );
    });
  });
});
