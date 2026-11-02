import { buildOtpauthUrl } from '../../../../../src/auth/mfa/otpauth';

describe('buildOtpauthUrl', () => {
  test('should build a TOTP provisioning URI', () => {
    const url = buildOtpauthUrl({
      issuer: 'Auth Service',
      account: 'user@example.com',
      secret: 'ABC234',
    });

    assert.strictEqual(
      url,
      'otpauth://totp/Auth%20Service%3Auser%40example.com' +
        '?secret=ABC234&issuer=Auth%20Service&algorithm=SHA1&digits=6&period=30',
    );
  });
});
