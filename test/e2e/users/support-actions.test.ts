import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import { Roles } from '../../../src/common/enums/roles.enum';
import type { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_PLAIN_PASSWORD,
  DEFAULT_USER_TOKEN,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { createApplicationAccess } from '../../helpers/application-access';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E users support actions', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createUser = (overrides: Partial<User> = {}) =>
    fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('support'),
      ...overrides,
    });

  const login = (email: string, application: string) =>
    request(app).post('/auth/login').send({
      email,
      password: DEFAULT_USER_PLAIN_PASSWORD,
      application,
    });

  test('AC-1: unlock clears the four counters and restores the login', async () => {
    const user = await createUser({
      loginAttempts: 5,
      lockoutUntil: new Date(Date.now() + 60_000),
      mfaFailedAttempts: 3,
      mfaLockoutUntil: new Date(Date.now() + 60_000),
    });
    const { application } = await createApplicationAccess(user._id.toString());

    const response = await request(app)
      .post(`/users/${user._id.toString()}/unlock`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.ok(response.body._id);

    // The profile serialization hides the counters, so the contract is checked
    // against the persisted document.
    const persisted = await fixture.findOne<User>('User', { _id: user._id });
    assert.strictEqual(persisted?.loginAttempts, 0);
    assert.strictEqual(persisted?.lockoutUntil, null);
    assert.strictEqual(persisted?.mfaFailedAttempts, 0);
    assert.strictEqual(persisted?.mfaLockoutUntil, null);

    await login(user.email, application.slug).expect(200);
  });

  test('AC-2: verify marks the account and unblocks the login', async () => {
    const user = await createUser({ verified: false });
    const { application } = await createApplicationAccess(user._id.toString());

    const denied = await login(user.email, application.slug).expect(403);
    assert.strictEqual(denied.body.message, 'Email is not verified');

    const verified = await request(app)
      .post(`/users/${user._id.toString()}/verify`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    assert.strictEqual(verified.body.verified, true);

    await login(user.email, application.slug).expect(200);
  });

  test('AC-3: the owner and an unknown id answer the same 404', async () => {
    const owner = await createUser({
      role: Roles.OWNER,
      verified: true,
    });
    const unknown = new Types.ObjectId().toString();

    for (const action of ['unlock', 'verify']) {
      const ownerResponse = await request(app)
        .post(`/users/${owner._id.toString()}/${action}`)
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .expect(404);

      const unknownResponse = await request(app)
        .post(`/users/${unknown}/${action}`)
        .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
        .expect(404);

      assert.strictEqual(unknownResponse.body.code, ownerResponse.body.code);
      assert.strictEqual(
        unknownResponse.body.message,
        ownerResponse.body.message,
      );
    }
  });

  test('AC-4: only the owner can run the support actions', async () => {
    const user = await createUser();

    for (const action of ['unlock', 'verify']) {
      await request(app)
        .post(`/users/${user._id.toString()}/${action}`)
        .set('Authorization', bearer(DEFAULT_USER_TOKEN))
        .expect(403);

      await request(app)
        .post(`/users/${user._id.toString()}/${action}`)
        .expect(401);
    }
  });
});
