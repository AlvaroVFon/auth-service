import { TelegramAdapter } from '../../../../../src/libs/telegram/adapters/telegram.adapter';
import { TelegramDeliveryError } from '../../../../../src/libs/telegram/telegram.errors';

describe('TelegramAdapter', () => {
  const botToken = '123456:secret-token';

  test('should post a message to the Bot API', async () => {
    const fetchFn = mock.fn(async () => ({
      ok: true,
      status: 200,
    }));
    const adapter = new TelegramAdapter({
      botToken,
      fetch: fetchFn as unknown as typeof fetch,
    });

    await adapter.sendMessage('4242', 'hello');

    const [url, init] = fetchFn.mock.calls[0]!.arguments as [
      string,
      RequestInit,
    ];
    assert.strictEqual(
      url,
      `https://api.telegram.org/bot${botToken}/sendMessage`,
    );
    assert.strictEqual(init.method, 'POST');
    assert.deepStrictEqual(JSON.parse(init.body as string), {
      chat_id: '4242',
      text: 'hello',
    });
    assert.ok(init.signal);
  });

  test('should sanitize a non-2xx response', async () => {
    const adapter = new TelegramAdapter({
      botToken,
      fetch: (async () => ({
        ok: false,
        status: 500,
      })) as unknown as typeof fetch,
    });

    await assert.rejects(
      adapter.sendMessage('1', 'hello'),
      (error: unknown) => {
        assert.ok(error instanceof TelegramDeliveryError);
        const deliveryError = error as TelegramDeliveryError;
        assert.strictEqual(
          deliveryError.message,
          'Telegram delivery failed with status 500',
        );
        assert.strictEqual(deliveryError.message.includes(botToken), false);
        assert.strictEqual(deliveryError.stack?.includes(botToken), false);
        return true;
      },
    );
  });

  test('should not leak the token or URL when fetch fails', async () => {
    const adapter = new TelegramAdapter({
      botToken,
      fetch: (async () => {
        throw new Error(`failed https://api.telegram.org/bot${botToken}`);
      }) as unknown as typeof fetch,
    });

    await assert.rejects(
      adapter.sendMessage('1', 'hello'),
      (error: unknown) => {
        assert.ok(error instanceof TelegramDeliveryError);
        const deliveryError = error as TelegramDeliveryError;
        assert.strictEqual(
          deliveryError.message,
          'Telegram message delivery failed',
        );
        assert.strictEqual(deliveryError.message.includes(botToken), false);
        assert.strictEqual(
          deliveryError.stack?.includes('api.telegram.org'),
          false,
        );
        return true;
      },
    );
  });

  test('should abort and sanitize a slow request', async () => {
    const adapter = new TelegramAdapter({
      botToken,
      timeoutMs: 10,
      fetch: ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        })) as unknown as typeof fetch,
    });

    await assert.rejects(
      adapter.sendMessage('1', 'hello'),
      TelegramDeliveryError,
    );
  });
});
