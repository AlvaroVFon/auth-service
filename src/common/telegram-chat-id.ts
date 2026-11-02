import { InvalidArgumentError } from './exceptions/base.exception';

export const TELEGRAM_CHAT_ID_REGEX = /^-?\d{1,20}$/;

export const normalizeTelegramChatId = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new InvalidArgumentError('telegramChatId must be a string');
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }
  if (!TELEGRAM_CHAT_ID_REGEX.test(trimmed)) {
    throw new InvalidArgumentError('telegramChatId must be a numeric chat id');
  }

  return trimmed;
};
