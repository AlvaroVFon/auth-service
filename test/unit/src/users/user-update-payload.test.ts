import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import {
  EDITABLE_USER_UPDATE_FIELDS,
  parseUserUpdatePayload,
} from '../../../../src/users/user-update-payload';

describe('parseUserUpdatePayload', () => {
  test('should expose the editable profile fields', () => {
    assert.deepStrictEqual(
      [...EDITABLE_USER_UPDATE_FIELDS],
      ['username', 'email', 'password', 'telegramChatId'],
    );
  });

  test('should keep the editable profile fields', () => {
    const payload = parseUserUpdatePayload({
      username: 'new-name',
      email: 'new@example.com',
      password: 'StrongPassword123!',
      telegramChatId: '4242',
    });

    assert.deepStrictEqual(payload, {
      username: 'new-name',
      email: 'new@example.com',
      password: 'StrongPassword123!',
      telegramChatId: '4242',
    });
  });

  test('should normalise the email before storing it', () => {
    const payload = parseUserUpdatePayload({ email: '  New@Example.COM ' });

    assert.strictEqual(payload.email, 'new@example.com');
  });

  test('should reject an email that is not a valid address', () => {
    for (const email of ['not-an-email', 'missing-domain@', '   ', '']) {
      assert.throws(
        () => parseUserUpdatePayload({ email }),
        (error: unknown) =>
          error instanceof InvalidArgumentError &&
          error.message === 'Invalid email format',
      );
    }
  });

  test('should reject an empty or whitespace-only password', () => {
    for (const password of ['', '   ']) {
      assert.throws(
        () => parseUserUpdatePayload({ password }),
        (error: unknown) =>
          error instanceof InvalidArgumentError &&
          error.message === 'password must not be empty',
      );
    }
  });

  test('should reject a password that does not meet the policy', () => {
    for (const password of [
      'Sh1!a',
      'nouppercase123!',
      'NOLOWERCASE123!',
      'NoNumberHere!',
      'NoSpecial123',
    ]) {
      assert.throws(
        () => parseUserUpdatePayload({ password }),
        (error: unknown) =>
          error instanceof InvalidArgumentError &&
          error.message.startsWith('password must be at least 8 characters'),
      );
    }
  });

  test('should keep a null telegram chat id so it can be cleared', () => {
    const payload = parseUserUpdatePayload({ telegramChatId: null });

    assert.deepStrictEqual(payload, { telegramChatId: null });
  });

  test('should reject security fields and list them', () => {
    for (const body of [
      { mfaEnabled: false },
      { mfaSecret: 'secret' },
      { mfaPendingSecret: 'secret' },
      { mfaRecoveryCodes: ['hash'] },
      { mfaFailedAttempts: 0 },
      { loginAttempts: 0 },
      { lockoutUntil: null },
      { verified: true },
      { role: 'owner' },
      { passwordHash: 'hash' },
      { _id: '64b64c4f4f4f4f4f4f4f4f4f' },
      { id: '64b64c4f4f4f4f4f4f4f4f4f' },
      { __v: 0 },
    ]) {
      const [field] = Object.keys(body);

      assert.throws(
        () => parseUserUpdatePayload(body),
        (error: unknown) =>
          error instanceof InvalidArgumentError &&
          error.message === `Fields are not editable: ${field}`,
      );
    }
  });

  test('should list every rejected field sorted and unique', () => {
    assert.throws(
      () =>
        parseUserUpdatePayload({
          verified: true,
          role: 'owner',
          loginAttempts: 0,
          username: 'new-name',
        }),
      (error: unknown) =>
        error instanceof InvalidArgumentError &&
        error.message ===
          'Fields are not editable: loginAttempts, role, verified',
    );
  });

  test('should reject an empty body', () => {
    assert.throws(
      () => parseUserUpdatePayload({}),
      (error: unknown) =>
        error instanceof InvalidArgumentError &&
        error.message === 'Request body is required',
    );
  });

  test('should reject editable fields with the wrong type', () => {
    for (const [field, value] of [
      ['username', 12],
      ['email', null],
      ['password', {}],
      ['telegramChatId', 4242],
    ] as const) {
      assert.throws(
        () => parseUserUpdatePayload({ [field]: value }),
        (error: unknown) =>
          error instanceof InvalidArgumentError &&
          error.message === `${field} must be a string`,
      );
    }
  });
});
