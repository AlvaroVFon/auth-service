import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { OneTimeLink } from '../../../src/links/link.interface';
import type { User } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_PLAIN_PASSWORD,
  DEFAULT_USER_TOKEN,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { createApplicationAccess } from '../../helpers/application-access';
import { getTestAppInstance, telegramMock } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;
const OLD_PASSWORD = DEFAULT_USER_PLAIN_PASSWORD;
const NEW_PASSWORD = 'AnotherPassword123!';

describe('E2E password reset links', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createUser = () =>
    fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('reset-link'),
    });

  const createResetLink = (userId: string) =>
    request(app)
      .post('/auth/password-reset-links')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ userId })
      .expect(201);

  test('lets the owner create a reset link', async () => {
    const user = await createUser();

    const response = await createResetLink(user._id.toString());

    assert.match(response.body.link, /\/reset-password\?token=.+/);
    assert.strictEqual(response.body.userId, user._id.toString());
    assert.ok(response.body.expiresAt);
  });

  test('notifies the user chat and falls back to the owner', async () => {
    const user = await fixture.create<User>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('reset-telegram'),
      telegramChatId: '4242',
    });

    const notified = await createResetLink(user._id.toString());
    assert.deepStrictEqual(notified.body.notification, {
      delivered: true,
      recipient: 'invitee',
    });
    const [chatId] = telegramMock.sendMessage.mock.calls.at(-1)!.arguments as [
      string,
    ];
    assert.strictEqual(chatId, '4242');

    const plain = await createUser();
    const fallback = await createResetLink(plain._id.toString());
    assert.deepStrictEqual(fallback.body.notification, {
      delivered: true,
      recipient: 'owner',
    });
    const [ownerChat] = telegramMock.sendMessage.mock.calls.at(-1)!
      .arguments as [string];
    assert.strictEqual(ownerChat, '999');
  });

  test('returns a usable link when the bot fails', async () => {
    const user = await createUser();
    telegramMock.sendMessage.mock.mockImplementationOnce(() =>
      Promise.reject(new Error('bot down')),
    );

    const created = await createResetLink(user._id.toString());
    assert.strictEqual(created.body.notification.delivered, false);
    const token = new URL(created.body.link).searchParams.get(
      'token',
    ) as string;

    await request(app)
      .post('/auth/password-reset-links/accept')
      .send({
        token,
        newPassword: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      })
      .expect(204);
  });

  test('restricts reset link creation to the global owner', async () => {
    const user = await createUser();

    await request(app)
      .post('/auth/password-reset-links')
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .send({ userId: user._id.toString() })
      .expect(403);

    const { application } = await createApplicationAccess(user._id.toString());
    const login = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: OLD_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    await request(app)
      .post('/auth/password-reset-links')
      .set('Authorization', bearer(login.body.accessToken))
      .send({ userId: user._id.toString() })
      .expect(401);
  });

  test('validates the target user', async () => {
    await request(app)
      .post('/auth/password-reset-links')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ userId: 'bad-id' })
      .expect(400);

    await request(app)
      .post('/auth/password-reset-links')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ userId: '64b64c4f4f4f4f4f4f4f4f4f' })
      .expect(404);
  });

  test('AC-4: sets the password once and revokes sessions', async () => {
    const user = await createUser();
    const { application } = await createApplicationAccess(user._id.toString());
    const login = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: OLD_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    const created = await createResetLink(user._id.toString());
    const token = new URL(created.body.link).searchParams.get(
      'token',
    ) as string;

    await request(app)
      .post('/auth/password-reset-links/accept')
      .send({
        token,
        newPassword: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      })
      .expect(204);

    await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: OLD_PASSWORD,
        application: application.slug,
      })
      .expect(401);

    await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: NEW_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);

    await request(app)
      .post('/auth/password-reset-links/accept')
      .send({
        token,
        newPassword: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      })
      .expect(400);
  });

  test('AC-3: rejects an expired reset link', async () => {
    const user = await createUser();
    const created = await createResetLink(user._id.toString());
    const token = new URL(created.body.link).searchParams.get(
      'token',
    ) as string;

    await fixture.updateOne<OneTimeLink>(
      'Link',
      { userId: user._id },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    await request(app)
      .post('/auth/password-reset-links/accept')
      .send({
        token,
        newPassword: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      })
      .expect(400);
  });

  test('validates the new password', async () => {
    const user = await createUser();
    const created = await createResetLink(user._id.toString());
    const token = new URL(created.body.link).searchParams.get(
      'token',
    ) as string;

    await request(app)
      .post('/auth/password-reset-links/accept')
      .send({
        token,
        newPassword: 'weak',
        passwordConfirmation: 'weak',
      })
      .expect(400);

    await request(app)
      .post('/auth/password-reset-links/accept')
      .send({
        token,
        newPassword: NEW_PASSWORD,
        passwordConfirmation: 'DifferentPassword123!',
      })
      .expect(400);
  });
});
