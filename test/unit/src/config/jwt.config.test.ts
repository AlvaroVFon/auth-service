import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import { resolveJwtConfig } from '../../../../src/config/jwt.config';
import { createRsaKeyPair } from '../../../helpers/jwt-keyring.helper';

const env = (values: Record<string, string>): NodeJS.ProcessEnv =>
  ({ ...values }) as NodeJS.ProcessEnv;

describe('resolveJwtConfig', () => {
  test('should build a keyring from the environment keys and issuer', () => {
    const pair = createRsaKeyPair();

    const config = resolveJwtConfig({
      env: env({
        JWT_PRIVATE_KEY: pair.privateKey,
        JWT_PUBLIC_KEY: pair.publicKey,
        JWT_KEY_ID: 'primary',
        JWT_ISSUER: 'home-auth',
        JWT_SECRET: 'legacy-secret',
      }),
    });

    assert.strictEqual(config.issuer, 'home-auth');
    assert.strictEqual(config.legacySecret, 'legacy-secret');
    assert.strictEqual(config.keyring.getSigningKey().kid, 'primary');
    assert.strictEqual(config.keyring.getJwks().length, 1);
  });

  test('should accept PEM values with escaped newlines', () => {
    const pair = createRsaKeyPair();

    const config = resolveJwtConfig({
      env: env({
        JWT_PRIVATE_KEY: pair.privateKey.replace(/\n/g, '\\n'),
        JWT_PUBLIC_KEY: pair.publicKey.replace(/\n/g, '\\n'),
      }),
    });

    assert.ok(config.keyring.getSigningKey().privateKey);
  });

  test('should keep retired public keys resolvable during rotation', () => {
    const retired = createRsaKeyPair();
    const active = createRsaKeyPair();

    const config = resolveJwtConfig({
      env: env({
        JWT_PRIVATE_KEY: active.privateKey,
        JWT_PUBLIC_KEY: active.publicKey,
        JWT_RETIRED_PUBLIC_KEYS: JSON.stringify([
          { kid: 'old-key', publicKey: retired.publicKey },
        ]),
      }),
    });

    assert.ok(config.keyring.getPublicKey('old-key'));
    assert.strictEqual(config.keyring.getJwks().length, 2);
  });

  test('should reject malformed retired keys JSON', () => {
    const pair = createRsaKeyPair();

    assert.throws(
      () =>
        resolveJwtConfig({
          env: env({
            JWT_PRIVATE_KEY: pair.privateKey,
            JWT_PUBLIC_KEY: pair.publicKey,
            JWT_RETIRED_PUBLIC_KEYS: '{not-json',
          }),
        }),
      InvalidArgumentError,
    );
  });

  test('should reject duplicated retired key ids', () => {
    const active = createRsaKeyPair();
    const retired = createRsaKeyPair();

    assert.throws(
      () =>
        resolveJwtConfig({
          env: env({
            JWT_PRIVATE_KEY: active.privateKey,
            JWT_PUBLIC_KEY: active.publicKey,
            JWT_KEY_ID: 'same',
            JWT_RETIRED_PUBLIC_KEYS: JSON.stringify([
              { kid: 'same', publicKey: retired.publicKey },
            ]),
          }),
        }),
      InvalidArgumentError,
    );
  });

  test('should fail when no keys are configured and ephemeral keys are not allowed', () => {
    assert.throws(
      () => resolveJwtConfig({ env: env({}) }),
      InvalidArgumentError,
    );
    assert.throws(
      () =>
        resolveJwtConfig({
          env: env({ JWT_ALLOW_EPHEMERAL_KEYS: '1' }),
        }),
      InvalidArgumentError,
    );
  });

  test('should reject a public key without a private key', () => {
    const pair = createRsaKeyPair();

    assert.throws(
      () =>
        resolveJwtConfig({
          env: env({
            JWT_PUBLIC_KEY: pair.publicKey,
            JWT_ALLOW_EPHEMERAL_KEYS: 'true',
          }),
        }),
      InvalidArgumentError,
    );
  });

  test('should reuse a generated key pair when ephemeral keys are allowed', () => {
    const first = resolveJwtConfig({
      env: env({ JWT_ALLOW_EPHEMERAL_KEYS: 'true' }),
    });
    const second = resolveJwtConfig({
      env: env({ JWT_ALLOW_EPHEMERAL_KEYS: 'true' }),
    });

    assert.strictEqual(
      first.keyring.getSigningKey().kid,
      second.keyring.getSigningKey().kid,
    );
    assert.strictEqual(first.issuer, 'auth-service');
    assert.strictEqual(first.legacySecret, undefined);
  });
});
