import { isHealthProbe } from '../../../../src/health/health.paths';

describe('health paths', () => {
  test('should recognise the liveness and readiness probes', () => {
    assert.strictEqual(isHealthProbe('/health'), true);
    assert.strictEqual(isHealthProbe('/ready'), true);
  });

  test('should not treat application routes as probes', () => {
    assert.strictEqual(isHealthProbe('/users'), false);
    assert.strictEqual(isHealthProbe('/auth/login'), false);
    assert.strictEqual(isHealthProbe('/healthz'), false);
    assert.strictEqual(isHealthProbe('/'), false);
  });
});
