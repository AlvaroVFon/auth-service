import {
  normalizeCorsOrigins,
  resolveCorsOrigins,
} from '../../../../src/config/cors.config';

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

  test('should normalize trailing slashes, casing and default ports', () => {
    assert.deepStrictEqual(
      resolveCorsOrigins('HTTPS://APP.TEST/, http://other.test:80/'),
      ['https://app.test', 'http://other.test'],
    );
  });

  test('should remove duplicated origins after normalization', () => {
    assert.deepStrictEqual(
      resolveCorsOrigins('http://a.test, HTTP://A.TEST/'),
      ['http://a.test'],
    );
  });

  test('should reject the wildcard origin', () => {
    assert.throws(() => resolveCorsOrigins('*'), /wildcard origins/);
  });

  test('should reject entries that are not bare origins', () => {
    assert.throws(
      () => resolveCorsOrigins('https://app.test/callback'),
      /only scheme, host and port/,
    );
    assert.throws(
      () => resolveCorsOrigins('https://app.test?tenant=1'),
      /only scheme, host and port/,
    );
    assert.throws(
      () => resolveCorsOrigins('https://user:secret@app.test'),
      /only scheme, host and port/,
    );
    assert.throws(
      () => resolveCorsOrigins('https://*.test'),
      /only scheme, host and port/,
    );
    assert.throws(
      () => resolveCorsOrigins('ftp://app.test'),
      /only scheme, host and port/,
    );
  });

  test('should reject entries without a scheme', () => {
    assert.throws(
      () => resolveCorsOrigins('app.test'),
      /expected a full origin/,
    );
  });
});

describe('normalizeCorsOrigins', () => {
  test('should normalize and deduplicate programmatic origins', () => {
    assert.deepStrictEqual(
      normalizeCorsOrigins([
        'HTTP://APP.TEST/',
        'http://app.test:80',
        ' https://other.test ',
      ]),
      ['http://app.test', 'https://other.test'],
    );
  });

  test('should reject invalid programmatic origins', () => {
    assert.throws(
      () => normalizeCorsOrigins(['https://app.test/path']),
      /only scheme, host and port/,
    );
  });
});
