import {
  generateLinkToken,
  hashLinkToken,
} from '../../../../src/links/link-token';

describe('link tokens', () => {
  test('should generate a URL-safe high-entropy token', () => {
    const token = generateLinkToken();

    assert.ok(token.length >= 43);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
  });

  test('should generate a different token every time', () => {
    assert.notStrictEqual(generateLinkToken(), generateLinkToken());
  });

  test('should hash a token into a deterministic SHA-256 digest', () => {
    const token = generateLinkToken();
    const first = hashLinkToken(token);
    const second = hashLinkToken(token);

    assert.match(first, /^[a-f0-9]{64}$/);
    assert.strictEqual(first, second);
    assert.notStrictEqual(first, token);
  });
});
