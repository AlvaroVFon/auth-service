import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import { resolveTelegramConfig } from '../../../../src/config/telegram.config';

describe('resolveTelegramConfig', () => {
  test('should disable the feature without a bot token', () => {
    assert.strictEqual(resolveTelegramConfig({ env: {} }), null);
  });

  test('should read the token, owner chat and timeout', () => {
    const config = resolveTelegramConfig({
      env: {
        TELEGRAM_BOT_TOKEN: '  123:abc  ',
        TELEGRAM_OWNER_CHAT_ID: ' 999 ',
        TELEGRAM_TIMEOUT_MS: '1500',
      },
    });

    assert.deepStrictEqual(config, {
      botToken: '123:abc',
      ownerChatId: '999',
      timeoutMs: 1500,
    });
  });

  test('should default the timeout to 3 seconds', () => {
    const config = resolveTelegramConfig({
      env: { TELEGRAM_BOT_TOKEN: 'token' },
    });

    assert.strictEqual(config?.timeoutMs, 3000);
    assert.strictEqual(config?.ownerChatId, undefined);
  });

  test('should reject an invalid owner chat id at startup', () => {
    assert.throws(
      () =>
        resolveTelegramConfig({
          env: {
            TELEGRAM_BOT_TOKEN: 'token',
            TELEGRAM_OWNER_CHAT_ID: 'not-a-chat',
          },
        }),
      new InvalidArgumentError(
        'TELEGRAM_OWNER_CHAT_ID must be a numeric chat id',
      ),
    );
  });

  test('should reject an invalid timeout', () => {
    for (const value of ['0', '-1', 'abc']) {
      assert.throws(
        () =>
          resolveTelegramConfig({
            env: {
              TELEGRAM_BOT_TOKEN: 'token',
              TELEGRAM_TIMEOUT_MS: value,
            },
          }),
        new InvalidArgumentError(
          'TELEGRAM_TIMEOUT_MS must be a positive number',
        ),
      );
    }
  });
});
