import { resolveAccessTokenTtl } from '../../../../src/config/application.composition';

describe('application composition configuration', () => {
  test('uses JWT_EXPIRATION for access tokens', () => {
    const originalExpiration = process.env.JWT_EXPIRATION;
    const originalLegacyExpiration = process.env.JWT_EXPIRES_IN;

    process.env.JWT_EXPIRATION = '123';
    delete process.env.JWT_EXPIRES_IN;

    try {
      assert.strictEqual(resolveAccessTokenTtl({}), 123);
    } finally {
      if (originalExpiration === undefined) {
        delete process.env.JWT_EXPIRATION;
      } else {
        process.env.JWT_EXPIRATION = originalExpiration;
      }
      if (originalLegacyExpiration === undefined) {
        delete process.env.JWT_EXPIRES_IN;
      } else {
        process.env.JWT_EXPIRES_IN = originalLegacyExpiration;
      }
    }
  });

  test('prefers an explicit access token ttl override', () => {
    assert.strictEqual(resolveAccessTokenTtl({ jwtExpiresIn: 456 }), 456);
  });
});
