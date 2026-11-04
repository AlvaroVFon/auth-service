import { Request, Response } from 'express';

import { JwksController } from '../../../../src/jwks/jwks.controller';
import { JwtKeyring } from '../../../../src/libs/jwt';
import { createRsaKeyPair } from '../../../helpers/jwt-keyring.helper';

describe('JwksController', () => {
  const createController = (keyring: JwtKeyring): JwksController =>
    new JwksController(
      () => keyring.getJwks(),
      () => keyring.getStatus(),
    );

  test('should return the public JWKS with a short cache header', () => {
    const keyring = new JwtKeyring([{ ...createRsaKeyPair(), active: true }]);
    const controller = createController(keyring);
    const set = mock.fn();
    const status = mock.fn(() => ({ json }));
    const json = mock.fn();

    controller.show({} as Request, { set, status } as unknown as Response);

    assert.strictEqual(set.mock.calls.length, 1);
    assert.deepStrictEqual(set.mock.calls[0]?.arguments, [
      'Cache-Control',
      'public, max-age=300',
    ]);
    assert.strictEqual(status.mock.calls[0]?.arguments[0], 200);

    const body = json.mock.calls[0]?.arguments[0] as {
      keys: Record<string, unknown>[];
    };
    assert.strictEqual(body.keys.length, 1);
    assert.strictEqual(body.keys[0]?.kty, 'RSA');
    assert.strictEqual(body.keys[0]?.d, undefined);
    assert.strictEqual(body.keys[0]?.p, undefined);
  });

  test('should expose the key status without key material', () => {
    const active = createRsaKeyPair();
    const keyring = new JwtKeyring([
      { publicKey: createRsaKeyPair().publicKey, kid: 'retired' },
      { ...active, kid: 'active', active: true },
    ]);
    const controller = createController(keyring);
    const set = mock.fn();
    const status = mock.fn(() => ({ json }));
    const json = mock.fn();

    controller.status({} as Request, { set, status } as unknown as Response);

    assert.deepStrictEqual(set.mock.calls[0]?.arguments, [
      'Cache-Control',
      'no-store',
    ]);
    assert.strictEqual(status.mock.calls[0]?.arguments[0], 200);

    const body = json.mock.calls[0]?.arguments[0] as {
      activeKid: string;
      keys: { kid: string; status: string; publishedAt: string }[];
    };
    assert.strictEqual(body.activeKid, 'active');
    assert.deepStrictEqual(
      body.keys.map(({ kid, status: role }) => ({ kid, role })),
      [
        { kid: 'retired', role: 'retired' },
        { kid: 'active', role: 'active' },
      ],
    );
    assert.ok(body.keys.every(({ publishedAt }) => publishedAt));
    assert.ok(!JSON.stringify(body).includes(active.privateKey));
  });
});
