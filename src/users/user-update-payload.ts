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

  if (keys.length === 0) {
    throw new InvalidArgumentError('Request body is required');
  }

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
    update.email = assertStringField('email', payload['email']);
  }
  if ('password' in payload) {
    update.password = assertStringField('password', payload['password']);
  }
  if ('telegramChatId' in payload) {
    const telegramChatId = payload['telegramChatId'];

    // `null` is the documented way to unregister the chat; the service
    // normalises and validates the value otherwise.
    if (telegramChatId !== null) {
      assertStringField('telegramChatId', telegramChatId);
    }

    update.telegramChatId = telegramChatId as string | null;
  }

  return update;
};
