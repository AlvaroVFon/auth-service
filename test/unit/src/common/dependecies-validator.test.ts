import { assertDependencies } from '../../../../src/common/depencencies-validator';

describe('Dependencies Validator', () => {
  test('should not throw if all dependencies are provided', () => {
    const deps = {
      dep1: {},
      dep2: 'some value',
      dep3: 42,
      dep4: true,
    };

    assert.doesNotThrow(() => {
      assertDependencies(deps, 'TestContext');
    });
  });

  test('should exit process if any dependency is missing', () => {
    const mockExit = mock.fn();
    const mockLog = mock.fn();
    process.exit = mockExit;
    console.error = mockLog;

    const deps = {
      dep1: {},
      dep2: null,
      dep3: 42,
    };

    assertDependencies(deps, 'TestContext');

    assert.ok(mockExit.mock.calls.length === 1);
    assert.ok(mockLog.mock.calls.length === 1);
    assert.strictEqual(
      mockLog.mock.calls[0].arguments[0],
      "[BOOTSTRAP ERROR] Missing dependency 'dep2' in TestContext",
    );
  });
});
