import { Application } from 'express';
import request from 'supertest';

import { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import { DEFAULT_USER_PLAIN_PASSWORD } from '../../fixtures/defaults';
import { getTestAppInstance } from '../../utils/app';

describe('E2E login email casing', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should allow login with the email in a different casing', async () => {
    const user = await fixture.create<User>('User');

    const response = await request(app)
      .post('/auth/login')
      .send({
        email: user.email.toUpperCase(),
        password: DEFAULT_USER_PLAIN_PASSWORD,
      })
      .expect(200);

    assert.ok(response.body.accessToken);
  });
});
