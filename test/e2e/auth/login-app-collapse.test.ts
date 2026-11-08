import { Application } from 'express';
import request from 'supertest';

import fixture from '../../fixtures';
import {
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { getTestAppInstance } from '../../utils/app';

describe('E2E login application collapse', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('still verifies the password for an unknown application', async () => {
    const user = await fixture.create('User', {
      email: generateRandomEmail('collapse'),
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app)
        .post('/auth/login')
        .send({
          email: user.email,
          password: 'WrongPassword123!',
          application: 'unknown-application',
        })
        .expect(401);
    }

    // The lockout proves the invalid-application path ran the credential check
    // instead of short-circuiting before it.
    const locked = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: 'unknown-application',
      })
      .expect(423);

    assert.match(locked.body.message, /locked/i);
  });
});
