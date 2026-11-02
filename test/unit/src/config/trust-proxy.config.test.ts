import { resolveTrustProxy } from '../../../../src/config/trust-proxy.config';

describe('resolveTrustProxy', () => {
  test('should default to false when the value is missing or blank', () => {
    assert.strictEqual(resolveTrustProxy(undefined), false);
    assert.strictEqual(resolveTrustProxy(''), false);
    assert.strictEqual(resolveTrustProxy('   '), false);
  });

  test('should accept boolean literals', () => {
    assert.strictEqual(resolveTrustProxy('true'), true);
    assert.strictEqual(resolveTrustProxy(' FALSE '), false);
  });

  test('should accept a decimal hop count', () => {
    assert.strictEqual(resolveTrustProxy('0'), 0);
    assert.strictEqual(resolveTrustProxy('1'), 1);
    assert.strictEqual(resolveTrustProxy('2'), 2);
  });

  test('should reject anything that is not a boolean or a decimal hop count', () => {
    for (const value of ['-1', '1.5', '0x2', '1e3', 'yes', '10.0.0.0/8']) {
      assert.throws(() => resolveTrustProxy(value), /TRUST_PROXY/);
    }
  });
});
