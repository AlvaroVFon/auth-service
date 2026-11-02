import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import { normalizeTelegramChatId } from '../../../../src/common/telegram-chat-id';

describe('normalizeTelegramChatId', () => {
  test('should accept numeric and negative chat ids', () => {
    assert.strictEqual(normalizeTelegramChatId(' 123 '), '123');
    assert.strictEqual(
      normalizeTelegramChatId('-1001234567890'),
      '-1001234567890',
    );
  });

  test('should treat missing values as undefined', () => {
    assert.strictEqual(normalizeTelegramChatId(undefined), undefined);
    assert.strictEqual(normalizeTelegramChatId(null), undefined);
    assert.strictEqual(normalizeTelegramChatId('   '), undefined);
  });

  test('should reject malformed ids', () => {
    for (const value of ['abc', '12 34', {}, 12]) {
      assert.throws(() => normalizeTelegramChatId(value), InvalidArgumentError);
    }
  });
});
