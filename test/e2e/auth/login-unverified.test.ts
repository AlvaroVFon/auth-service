import { Application } from 'express';
import request from 'supertest';

import { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import { DEFAULT_USER_PLAIN_PASSWORD } from '../../fixtures/defaults';
import { getTestAppInstance } from '../../utils/app';

describe('E2E login unverified', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should reject an unverified account', async () => {
    const user = await fixture.create<User>('User', { verified: false });

    const response = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
      })
      .expect(403);

    assert.strictEqual(response.body.message, 'Email is not verified');
  });
});
