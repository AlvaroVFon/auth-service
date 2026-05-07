import request from 'supertest';
import { getTestAppInstance } from '../../utils/app';
import { Application } from 'express';
import fixture from '../../fixtures/fixture';
import { Code, CodeType } from '../../../src/auth/codes/code.interface';
import { Holder } from '../../../src/holders/holders.interface';

describe('Auth E2E - Verify Email', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  describe('POST /auth/verify', () => {
    test('should verify user email with valid code', async () => {
      const holder = await fixture.create<Holder>('Holder');
      const code = await fixture.create<Code>('Code', {
        holderId: holder._id,
        type: CodeType.SIGNUP,
      });

      await request(app)
        .post('/auth/verify')
        .query({ holderId: holder._id.toString() })
        .send({ code: code.code })
        .expect(204);
    });

    test('should return 400 for invalid verification code', async () => {
      const holder = await fixture.create<Holder>('Holder');

      const res = await request(app)
        .post('/auth/verify')
        .query({ holderId: holder._id.toString() })
        .send({ code: 'invalidcode' })
        .expect(400);

      assert.strictEqual(
        res.body.message,
        'The provided code is invalid, used or expired',
      );
      assert.strictEqual(res.body.code, 'INVALID_CODE');
    });

    test('should return 400 for expired verification code', async () => {
      const holder = await fixture.create<Holder>('Holder');
      const code = await fixture.create<Code>('Code', {
        holderId: holder._id,
        type: CodeType.SIGNUP,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });

      const res = await request(app)
        .post('/auth/verify')
        .query({ holderId: holder._id.toString() })
        .send({ code: code.code })
        .expect(400);

      assert.strictEqual(
        res.body.message,
        'The provided code is invalid, used or expired',
      );
      assert.strictEqual(res.body.code, 'INVALID_CODE');
    });

    test('should return 400 for missing holderId', async () => {
      const res = await request(app)
        .post('/auth/verify')
        .send({ code: 'somecode' })
        .expect(400);

      assert.strictEqual(res.body.message, 'holderId is required');
      assert.strictEqual(res.body.code, 'INVALID_ARGUMENT');
    });
  });
});
