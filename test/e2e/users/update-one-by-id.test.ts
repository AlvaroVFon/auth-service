import { Application } from 'express';
import request from 'supertest';

import { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import { generateRandomEmail } from '../../fixtures/defaults';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_TOKEN,
} from '../../fixtures/defaults';
import { getTestAppInstance } from '../../utils/app';

describe('E2E Test - Update User By ID', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should update a user by ID', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('updateonebyid'),
      password: 'password123',
    });

    const response = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ password: 'newpassword456' })
      .expect(200);

    const updatedUser = response.body;
    assert.equal(updatedUser._id, user._id);
    assert.notEqual(updatedUser.password, user.password);
    assert.ok(updatedUser.password !== 'password123');
  });

  test('should return 404 when updating a non-existent user', async () => {
    const nonExistentUserId = '64b64c4f4f4f4f4f4f4f4f4f'; // Example of a valid but non-existent ObjectId

    await request(app)
      .patch(`/users/${nonExistentUserId}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ password: 'newpassword456' })
      .expect(404);
  });

  test('should handle empty update data', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('emptyupdatedata'),
      password: 'password123',
    });

    const response = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({})
      .expect(400);

    assert.ok(response.body.message.includes('Request body is required'));
  });

  test('should keep administrative lockout fields writable', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('unlock'),
      password: 'password123',
      loginAttempts: 5,
      lockoutUntil: new Date(Date.now() + 600000),
    });

    const unlocked = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ loginAttempts: 0, lockoutUntil: null })
      .expect(200);

    assert.strictEqual(unlocked.body.loginAttempts, undefined);
    const stored = await fixture.findById<User>('User', user._id.toString());
    assert.strictEqual(stored?.loginAttempts, 0);
    assert.strictEqual(stored?.lockoutUntil, null);
  });

  test('should set and validate a telegram chat id', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('telegramupdate'),
      password: 'password123',
    });

    const updated = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ telegramChatId: ' 4242 ' })
      .expect(200);

    assert.strictEqual(updated.body.telegramChatId, '4242');

    await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ telegramChatId: 'abc' })
      .expect(400);
  });

  test('should ignore a role supplied in the update body', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('roleupdate'),
      password: 'password123',
    });

    const response = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ role: 'owner' })
      .expect(200);

    assert.strictEqual(response.body.role, 'user');
  });

  test('should return 403 when a non-admin user attempts to update a user', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('nonadminupdate'),
      password: 'password123',
    });

    await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_USER_TOKEN}`)
      .send({ password: 'newpassword456' })
      .expect(403);
  });
});
