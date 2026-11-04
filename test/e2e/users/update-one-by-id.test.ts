import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_PLAIN_PASSWORD,
  DEFAULT_USER_TOKEN,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { createApplicationAccess } from '../../helpers/application-access';
import { getTestAppInstance } from '../../utils/app';

const STRONG_PASSWORD_HASH =
  '$2b$10$njKm0/jBAa8VjVT4XXTbOOUqALanrKZLGrPaWXIACh6iZpoI1NUzm';

describe('E2E Test - Update User By ID', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should update the profile fields of a user', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('updateprofile'),
      username: 'original',
      password: 'password123',
    });

    const response = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ username: 'renamed' })
      .expect(200);

    assert.strictEqual(response.body.username, 'renamed');
    assert.strictEqual(response.body.email, user.email);

    const stored = await fixture.findById<User>('User', user._id.toString());
    assert.strictEqual(stored?.username, 'renamed');
  });

  test('should update the email of a user', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('updateemail'),
      password: 'password123',
    });
    const newEmail = generateRandomEmail('updatedemail');

    const response = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ email: newEmail })
      .expect(200);

    assert.strictEqual(response.body.email, newEmail);
    const stored = await fixture.findById<User>('User', user._id.toString());
    assert.strictEqual(stored?.email, newEmail);
  });

  test('should normalise the email of a user', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('updatenormalisedemail'),
      password: 'password123',
    });

    const response = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ email: '  Updated@Example.COM ' })
      .expect(200);

    assert.strictEqual(response.body.email, 'updated@example.com');
    const stored = await fixture.findById<User>('User', user._id.toString());
    assert.strictEqual(stored?.email, 'updated@example.com');
  });

  test('should reject an invalid email', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('updateinvalidemail'),
      password: 'password123',
    });

    const response = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ email: 'not-an-email' })
      .expect(400);

    assert.strictEqual(response.body.code, 'INVALID_ARGUMENT');
    assert.strictEqual(response.body.message, 'Invalid email format');

    const stored = await fixture.findById<User>('User', user._id.toString());
    assert.strictEqual(stored?.email, user.email);
  });

  test('should reject an email already used by another user', async () => {
    const existing = await fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('updateemailtaken'),
      password: 'password123',
    });
    const user = await fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('updateemailchanging'),
      password: 'password123',
    });

    const response = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ email: existing.email })
      .expect(400);

    assert.strictEqual(response.body.code, 'ENTITY_ALREADY_EXISTS');

    const stored = await fixture.findById<User>('User', user._id.toString());
    assert.strictEqual(stored?.email, user.email);
  });

  test('should reject an empty or weak password', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('updateweakpassword'),
      password: 'password123',
    });

    for (const password of ['', '   ', 'weakpassword']) {
      const response = await request(app)
        .patch(`/users/${user._id}`)
        .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
        .send({ password })
        .expect(400);

      assert.strictEqual(response.body.code, 'INVALID_ARGUMENT');
    }

    const stored = await fixture.findById<User>('User', user._id.toString());
    assert.strictEqual(stored?.password, user.password);
  });

  test('should rehash the password, hide it and keep the login working', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('updatepassword'),
      password: STRONG_PASSWORD_HASH,
    });
    const { application } = await createApplicationAccess(user._id.toString());
    const newPassword = 'NewStrongPassword456!';

    const response = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ password: newPassword })
      .expect(200);

    assert.strictEqual(response.body.password, undefined);
    assert.ok(!JSON.stringify(response.body).includes(newPassword));

    const stored = await fixture.findById<User>('User', user._id.toString());
    assert.notStrictEqual(stored?.password, newPassword);
    assert.ok(stored?.password.startsWith('$2'));

    await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: newPassword,
        application: application.slug,
      })
      .expect(200);

    await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(401);
  });

  test('should reject security fields and leave the document intact', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('securityfields'),
      password: 'password123',
      mfaEnabled: true,
      mfaSecret: 'stored-secret',
      verified: true,
    });

    for (const body of [
      { mfaEnabled: false },
      { mfaSecret: 'injected' },
      { mfaPendingSecret: 'injected' },
      { mfaRecoveryCodes: ['injected'] },
      { loginAttempts: 0 },
      { lockoutUntil: null },
      { verified: false },
      { role: 'owner' },
    ]) {
      const [field] = Object.keys(body);

      const response = await request(app)
        .patch(`/users/${user._id}`)
        .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
        .send(body)
        .expect(400);

      assert.strictEqual(response.body.code, 'INVALID_ARGUMENT');
      assert.ok(response.body.message.includes(field));
    }

    const stored = await fixture.findById<User>('User', user._id.toString());
    assert.strictEqual(stored?.mfaEnabled, true);
    assert.strictEqual(stored?.mfaSecret, 'stored-secret');
    assert.strictEqual(stored?.verified, true);
    assert.strictEqual(stored?.role, 'user');
    assert.strictEqual(stored?.loginAttempts, 0);
    assert.strictEqual(stored?.lockoutUntil, null);
  });

  test('should reject a mixed payload without applying the allowed fields', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('mixedpayload'),
      username: 'original',
      password: 'password123',
    });

    const response = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ username: 'renamed', verified: false })
      .expect(400);

    assert.ok(response.body.message.includes('verified'));

    const stored = await fixture.findById<User>('User', user._id.toString());
    assert.strictEqual(stored?.username, 'original');
    assert.strictEqual(stored?.verified, user.verified);
  });

  test('should return 404 when updating a non-existent user', async () => {
    const nonExistentUserId = '64b64c4f4f4f4f4f4f4f4f4f'; // Example of a valid but non-existent ObjectId

    await request(app)
      .patch(`/users/${nonExistentUserId}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ password: 'NewPassword456!' })
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

    const cleared = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .send({ telegramChatId: null })
      .expect(200);

    assert.strictEqual(cleared.body.telegramChatId, undefined);
    const stored = await fixture.findById<User>('User', user._id.toString());
    assert.strictEqual(stored?.telegramChatId, undefined);
  });

  test('should return 403 when a non-admin user attempts to update a user', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('nonadminupdate'),
      password: 'password123',
    });

    await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_USER_TOKEN}`)
      .send({ password: 'NewPassword456!' })
      .expect(403);
  });
});
