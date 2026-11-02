import { normalizeEmail } from '../../../../src/common/email';

describe('normalizeEmail', () => {
  test('should trim and lowercase the address', () => {
    assert.strictEqual(normalizeEmail('  Ana@Example.COM '), 'ana@example.com');
  });

  test('should leave an already normalized address untouched', () => {
    assert.strictEqual(normalizeEmail('ana@example.com'), 'ana@example.com');
  });
});
