import { getStringEnvVariable, getNumberEnvVariable } from '../../../src/config/env.config';

describe('Environment Configuration Tests', () => {
  describe('getStringEnvVar()', () => {
    test('should return defaultString when the environment variable is not set', () => {
      const result = getStringEnvVariable('TEST_STRING_VAR', 'defaultString');
      assert.strictEqual(result, 'defaultString');
    });

    test('should return the string value of the environment variable', () => {
      process.env['TEST_STRING_VAR'] = 'actualString';
      const result = getStringEnvVariable('TEST_STRING_VAR', 'defaultString');
      assert.strictEqual(result, 'actualString');
    });
  });

  describe('getNumberEnvVar()', () => {
    test('should return the number value of the environment variable', () => {
      const result = getNumberEnvVariable('TEST_NUMBER_VAR', 42);
      assert.strictEqual(result, 42);
    });

    test('should return the numeric value of the environment variable', () => {
      process.env['TEST_NUMBER_VAR'] = '100';
      const result = getNumberEnvVariable('TEST_NUMBER_VAR', 42);
      assert.strictEqual(result, 100);
    });
  });
});
