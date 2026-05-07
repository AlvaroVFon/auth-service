import request from 'supertest';
import { getTestAppInstance } from '../../utils/app';
import { Application } from 'express';
import fixture from '../../fixtures/fixture';
import { User } from '../../../src/users/users.interface';
import { Code, CodeType } from '../../../src/auth/codes/code.interface';
import { Types } from 'mongoose';

const createResetCode = async (userId: Types.ObjectId) => {
  return fixture.create<Code>('Code', {
    holderId: userId,
    type: CodeType.RESET_PASSWORD,
    used: false,
    expiresAt: new Date(Date.now() + 3600000),
  });
};

describe('Password Reset E2E Tests', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  describe('POST /auth/reset-password', () => {
    test('should reset password with valid userId and code', async () => {
      const user = await fixture.create<User>('User');
      const code = await createResetCode(user._id);
      const newPassword = 'NewP@ssw0rd123';

      await request(app)
        .post('/auth/reset-password')
        .send({
          userId: user._id.toString(),
          code: code.code,
          newPassword,
          passwordConfirmation: newPassword,
        })
        .expect(204);
    });

    test('should fail if password confirmation does not match', async () => {
      const user = await fixture.create<User>('User');
      const code = await createResetCode(user._id);

      const newPassword = 'NewP@ssw0rd123';

      const res = await request(app)
        .post('/auth/reset-password')
        .send({
          userId: user._id.toString(),
          code: code.code,
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

    test('should fail if code is invalid', async () => {
      const user = await fixture.create<User>('User');

      const newPassword = 'NewP@ssw0rd123';

      const res = await request(app)
        .post('/auth/reset-password')
        .send({
          userId: user._id.toString(),
          code: 'WRONGCODE',
          newPassword,
          passwordConfirmation: newPassword,
        })
        .expect(400);

      assert.strictEqual(
        res.body.message,
        'The provided code is invalid, used or expired',
      );
      assert.strictEqual(res.body.code, 'INVALID_CODE');
    });

    test('should fail if user does not exist', async () => {
      const newPassword = 'NewP@ssw0rd123';

      const res = await request(app)
        .post('/auth/reset-password')
        .send({
          userId: '000000000000000000000000',
          code: 'SOMECODE',
          newPassword,
          passwordConfirmation: newPassword,
        })
        .expect(404);

      assert.strictEqual(res.body.message, 'User not found');
      assert.strictEqual(res.body.code, 'NOT_FOUND');
    });
  });
});
