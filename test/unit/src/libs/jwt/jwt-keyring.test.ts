import { createSign, verify } from 'node:crypto';

import { InvalidArgumentError } from '../../../../../src/common/exceptions/base.exception';
import { JwtKeyring } from '../../../../../src/libs/jwt/jwt-keyring';
import { createRsaKeyPair } from '../../../../helpers/jwt-keyring.helper';

describe('JwtKeyring', () => {
  test('should publish the public key without private material', () => {
    const pair = createRsaKeyPair();
    const keyring = new JwtKeyring([{ ...pair, active: true }]);

    const [jwk] = keyring.getJwks();
    if (!jwk) {
      throw new Error('Expected a published JWK');
    }

    assert.strictEqual(jwk.kty, 'RSA');
    assert.strictEqual(jwk.use, 'sig');
    assert.strictEqual(jwk.alg, 'RS256');
    assert.ok(jwk.kid);
    assert.ok(jwk.n);
    assert.ok(jwk.e);
    assert.strictEqual(
      (jwk as unknown as Record<string, unknown>).d,
      undefined,
    );
    assert.strictEqual(
      (jwk as unknown as Record<string, unknown>).p,
      undefined,
    );
  });

  test('should derive a stable RFC 7638 kid and allow an override', () => {
    const pair = createRsaKeyPair();

    const derived = new JwtKeyring([{ ...pair, active: true }]);
    const repeated = new JwtKeyring([{ ...pair, active: true }]);
    const overridden = new JwtKeyring([
      { ...pair, kid: 'custom-kid', active: true },
    ]);

    assert.strictEqual(
      derived.getSigningKey().kid,
      repeated.getSigningKey().kid,
    );
    assert.strictEqual(overridden.getSigningKey().kid, 'custom-kid');
  });

  test('should verify a signature with the published public key', () => {
    const pair = createRsaKeyPair();
    const keyring = new JwtKeyring([{ ...pair, active: true }]);
    const signature = Buffer.from('signed-bytes');

    const signer = createSign('RSA-SHA256');
    signer.update(signature);
    signer.end();
    const signed = signer.sign(keyring.getSigningKey().privateKey, 'base64');

    const publicKey = keyring.getPublicKey(keyring.getSigningKey().kid);
    assert.ok(publicKey);
    if (!publicKey) {
      throw new Error('Missing public key');
    }
    assert.ok(
      verify('RSA-SHA256', signature, publicKey, Buffer.from(signed, 'base64')),
    );
  });

  test('should keep a retired public key resolvable while the active key signs', () => {
    const retired = createRsaKeyPair();
    const active = createRsaKeyPair();
    const retiredKid = new JwtKeyring([
      { ...retired, active: true },
    ]).getSigningKey().kid;

    const rotated = new JwtKeyring([
      { publicKey: retired.publicKey, kid: retiredKid },
      { ...active, active: true },
    ]);

    assert.notStrictEqual(rotated.getSigningKey().kid, retiredKid);
    assert.ok(rotated.getPublicKey(retiredKid));

    const withoutRetired = new JwtKeyring([{ ...active, active: true }]);
    assert.strictEqual(withoutRetired.getPublicKey(retiredKid), undefined);
  });

  test('should report the active and retired kids without key material', () => {
    const retired = createRsaKeyPair();
    const active = createRsaKeyPair();
    const retiredPublishedAt = '2026-10-01T00:00:00.000Z';
    const activePublishedAt = '2026-11-01T00:00:00.000Z';
    const keyring = new JwtKeyring([
      {
        publicKey: retired.publicKey,
        kid: 'old',
        publishedAt: retiredPublishedAt,
      },
      { ...active, kid: 'new', publishedAt: activePublishedAt, active: true },
    ]);

    const status = keyring.getStatus();

    assert.strictEqual(status.activeKid, 'new');
    assert.deepStrictEqual(status.keys, [
      {
        kid: 'old',
        status: 'retired',
        publishedAt: retiredPublishedAt,
      },
      {
        kid: 'new',
        status: 'active',
        publishedAt: activePublishedAt,
      },
    ]);

    const serialized = JSON.stringify(status);
    assert.ok(!serialized.includes('PRIVATE KEY'));
    assert.ok(!serialized.includes(active.privateKey));
    assert.ok(!serialized.includes(retired.publicKey));
  });

  test('should default the publication date to the keyring load time', () => {
    const before = Date.now();
    const keyring = new JwtKeyring([{ ...createRsaKeyPair(), active: true }]);
    const after = Date.now();

    const [key] = keyring.getStatus().keys;

    assert.ok(key);
    const publishedAt = Date.parse(key?.publishedAt ?? '');
    assert.ok(publishedAt >= before && publishedAt <= after);
  });

  test('should reject an invalid publication date', () => {
    assert.throws(
      () =>
        new JwtKeyring([
          { ...createRsaKeyPair(), active: true, publishedAt: 'not-a-date' },
        ]),
      InvalidArgumentError,
    );
  });

  test('should reject an empty keyring', () => {
    assert.throws(() => new JwtKeyring([]), InvalidArgumentError);
  });

  test('should reject duplicated kids', () => {
    const first = createRsaKeyPair();
    const second = createRsaKeyPair();

    assert.throws(
      () =>
        new JwtKeyring([
          { ...first, kid: 'same', active: true },
          { publicKey: second.publicKey, kid: 'same' },
        ]),
      InvalidArgumentError,
    );
  });

  test('should reject a public key that does not match the private key', () => {
    const first = createRsaKeyPair();
    const second = createRsaKeyPair();

    assert.throws(
      () =>
        new JwtKeyring([
          {
            privateKey: first.privateKey,
            publicKey: second.publicKey,
            active: true,
          },
        ]),
      InvalidArgumentError,
    );
  });

  test('should reject RSA keys shorter than 2048 bits', () => {
    const weak = createRsaKeyPair(1024);

    assert.throws(
      () => new JwtKeyring([{ ...weak, active: true }]),
      InvalidArgumentError,
    );
  });

  test('should require a private key for the active key', () => {
    const pair = createRsaKeyPair();

    assert.throws(
      () => new JwtKeyring([{ publicKey: pair.publicKey }]),
      InvalidArgumentError,
    );
  });
});
