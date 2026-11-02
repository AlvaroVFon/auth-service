import { normalizeEmail } from '../../../../src/common/email';

describe('normalizeEmail', () => {
  test('should trim and lowercase the address', () => {
    assert.strictEqual(normalizeEmail('  Ana@Example.COM '), 'ana@example.com');
  });

  test('should leave an already normalized address untouched', () => {
    assert.strictEqual(normalizeEmail('ana@example.com'), 'ana@example.com');
  });

  test('should return an empty string for non-string input', () => {
    assert.strictEqual(normalizeEmail(123), '');
    assert.strictEqual(normalizeEmail({}), '');
    assert.strictEqual(normalizeEmail(null), '');
    assert.strictEqual(normalizeEmail(undefined), '');
    assert.strictEqual(normalizeEmail(['ana@example.com']), '');
  });
});
