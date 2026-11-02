import { InvalidArgumentError } from '../common/exceptions/base.exception';
import { normalizeTelegramChatId } from '../common/telegram-chat-id';

const DEFAULT_TIMEOUT_MS = 3000;

export interface TelegramConfig {
  botToken: string;
  ownerChatId?: string;
  timeoutMs: number;
}

export interface ResolveTelegramConfigOptions {
  env?: NodeJS.ProcessEnv;
}

export const resolveTelegramConfig = (
  options: ResolveTelegramConfigOptions = {},
): TelegramConfig | null => {
  const env = options.env ?? process.env;
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();

  if (!botToken) {
    return null;
  }

  let ownerChatId: string | undefined;

  try {
    ownerChatId = normalizeTelegramChatId(env.TELEGRAM_OWNER_CHAT_ID);
  } catch {
    throw new InvalidArgumentError(
      'TELEGRAM_OWNER_CHAT_ID must be a numeric chat id',
    );
  }

  const rawTimeout = env.TELEGRAM_TIMEOUT_MS?.trim();
  const timeoutMs = rawTimeout ? Number(rawTimeout) : DEFAULT_TIMEOUT_MS;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new InvalidArgumentError(
      'TELEGRAM_TIMEOUT_MS must be a positive number',
    );
  }

  return {
    botToken,
    ...(ownerChatId ? { ownerChatId } : {}),
    timeoutMs,
  };
};
