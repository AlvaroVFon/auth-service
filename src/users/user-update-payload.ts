import { EMAIL_REGEX, PASSWORD_REGEX } from '../common/constants/regex';
import { normalizeEmail } from '../common/email';
import { InvalidArgumentError } from '../common/exceptions/base.exception';

// Profile fields an owner may edit through `PATCH /users/:id`. Everything else
// (roles, lockout bookkeeping, verification and MFA state) has its own flow, so
// the endpoint must reject it instead of writing it silently.
export const EDITABLE_USER_UPDATE_FIELDS = [
  'username',
  'email',
  'password',
  'telegramChatId',
] as const;

const EDITABLE_FIELDS = new Set<string>(EDITABLE_USER_UPDATE_FIELDS);

export interface UserUpdatePayload {
  username?: string;
  email?: string;
  password?: string;
  telegramChatId?: string | null;
}

const assertStringField = (field: string, value: unknown): string => {
  if (typeof value !== 'string') {
    throw new InvalidArgumentError(`${field} must be a string`);
  }

  return value;
};

export const parseUserUpdatePayload = (
  body: Record<string, unknown> | undefined,
): UserUpdatePayload => {
  const payload = body ?? {};
  const keys = Object.keys(payload);

  const rejected = [
    ...new Set(keys.filter((key) => !EDITABLE_FIELDS.has(key))),
  ].sort();

  if (rejected.length > 0) {
    throw new InvalidArgumentError(
      `Fields are not editable: ${rejected.join(', ')}`,
    );
  }

  const update: UserUpdatePayload = {};

  if ('username' in payload) {
    update.username = assertStringField('username', payload['username']);
  }
  if ('email' in payload) {
    // Email is the login identifier: it must be stored exactly in the form
    // `create`/`findByEmail` use, otherwise the account becomes unreachable.
    const email = normalizeEmail(assertStringField('email', payload['email']));

    if (!EMAIL_REGEX.test(email)) {
      throw new InvalidArgumentError('Invalid email format');
    }

    update.email = email;
  }
  if ('password' in payload) {
    const password = assertStringField('password', payload['password']);

    // The service hashes whatever reaches it, so an empty value would store a
    // literal empty string and leave the account unable to authenticate.
    if (password.trim().length === 0) {
      throw new InvalidArgumentError('password must not be empty');
    }
    if (!PASSWORD_REGEX.test(password)) {
      throw new InvalidArgumentError(
        'password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number and a special character',
      );
    }

    update.password = password;
  }
  if ('telegramChatId' in payload) {
    const telegramChatId = payload['telegramChatId'];

    // `null` is the documented way to unregister the chat; the service
    // normalises and validates the value otherwise.
    update.telegramChatId =
      telegramChatId === null
        ? null
        : assertStringField('telegramChatId', telegramChatId);
  }

  return update;
};
