import { resolveCorsOrigins } from '../../../../src/config/cors.config';

describe('resolveCorsOrigins', () => {
  test('should return an empty list when the value is missing', () => {
    assert.deepStrictEqual(resolveCorsOrigins(undefined), []);
    assert.deepStrictEqual(resolveCorsOrigins(''), []);
    assert.deepStrictEqual(resolveCorsOrigins(' , , '), []);
  });

  test('should split and trim a comma separated list', () => {
    assert.deepStrictEqual(
      resolveCorsOrigins('http://a.test, https://b.test ,http://c.test'),
      ['http://a.test', 'https://b.test', 'http://c.test'],
    );
  });
});
