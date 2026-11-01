import { resolveTrustProxy } from '../../../../src/config/trust-proxy.config';

describe('resolveTrustProxy', () => {
  test('should default to false when the value is missing', () => {
    assert.strictEqual(resolveTrustProxy(undefined), false);
    assert.strictEqual(resolveTrustProxy(''), false);
  });

  test('should accept boolean literals', () => {
    assert.strictEqual(resolveTrustProxy('true'), true);
    assert.strictEqual(resolveTrustProxy(' FALSE '), false);
  });

  test('should accept a hop count', () => {
    assert.strictEqual(resolveTrustProxy('1'), 1);
    assert.strictEqual(resolveTrustProxy('2'), 2);
  });

  test('should fall back to false for unsupported values', () => {
    assert.strictEqual(resolveTrustProxy('loopback'), false);
    assert.strictEqual(resolveTrustProxy('-1'), false);
    assert.strictEqual(resolveTrustProxy('1.5'), false);
  });
});
