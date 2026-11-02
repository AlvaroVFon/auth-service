import { Request, Response } from 'express';

import { JwksController } from '../../../../src/jwks/jwks.controller';
import { JwtKeyring } from '../../../../src/libs/jwt';
import { createRsaKeyPair } from '../../../helpers/jwt-keyring.helper';

describe('JwksController', () => {
  test('should return the public JWKS with a short cache header', () => {
    const keyring = new JwtKeyring([{ ...createRsaKeyPair(), active: true }]);
    const controller = new JwksController(() => keyring.getJwks());
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
});
