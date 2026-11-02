import { assertDependencies } from '../../../common/depencencies-validator';
import { TelegramDeliveryError } from '../telegram.errors';
import { TelegramAdapterOptions, TelegramPort } from '../telegram.interface';

const DEFAULT_TIMEOUT_MS = 3000;

export class TelegramAdapter implements TelegramPort {
  private readonly botToken: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: TelegramAdapterOptions) {
    assertDependencies({ botToken: options.botToken }, this.constructor.name);
    this.botToken = options.botToken;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn = options.fetch ?? globalThis.fetch;
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    try {
      const response = await this.fetchFn(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );

      if (!response.ok) {
        throw new TelegramDeliveryError(
          `Telegram delivery failed with status ${response.status}`,
        );
      }
    } catch (error) {
      if (error instanceof TelegramDeliveryError) {
        throw error;
      }

      // The bot token travels in the request URL: never attach the original
      // error (or its message) because it may contain the URL or token.
      throw new TelegramDeliveryError();
    }
  }
}
