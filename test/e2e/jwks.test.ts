import { createPublicKey } from 'node:crypto';

import { Application } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { JWT_REGEX } from '../../src/common/constants/regex';
import fixture from '../fixtures';
import {
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../fixtures/defaults';
import { getTestAppInstance } from '../utils/app';

describe('E2E JWKS', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should expose only public keys', async () => {
    const response = await request(app)
      .get('/.well-known/jwks.json')
      .expect(200);

    assert.strictEqual(
      response.headers['cache-control'],
      'public, max-age=300',
    );
    assert.ok(Array.isArray(response.body.keys));
    assert.ok(response.body.keys.length >= 1);

    for (const jwk of response.body.keys) {
      assert.strictEqual(jwk.kty, 'RSA');
      assert.strictEqual(jwk.alg, 'RS256');
      assert.strictEqual(jwk.use, 'sig');
      assert.ok(jwk.kid);
      assert.ok(jwk.n);
      assert.ok(jwk.e);
      assert.strictEqual(jwk.d, undefined);
      assert.strictEqual(jwk.p, undefined);
      assert.strictEqual(jwk.q, undefined);
    }
  });

  test('should issue login access tokens that verify with the published key', async () => {
    const email = generateRandomEmail('jwks-login');
    const signupCredentials = {
      email,
      password: DEFAULT_USER_PLAIN_PASSWORD,
      passwordConfirmation: DEFAULT_USER_PLAIN_PASSWORD,
    };

    const signupResponse = await request(app)
      .post('/auth/signup')
      .send(signupCredentials)
      .expect(201);

    const holderId = signupResponse.body._id;
    const code: any = await fixture.findOne('Code', { subjectId: holderId });

    await request(app)
      .post('/auth/verify')
      .query({ holderId })
      .send({ code: code.code })
      .expect(204);

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({ email, password: DEFAULT_USER_PLAIN_PASSWORD })
      .expect(200);

    const token = loginResponse.body.accessToken;
    assert.ok(JWT_REGEX.test(token));

    const header = jwt.decode(token, { complete: true })?.header;
    assert.strictEqual(header?.alg, 'RS256');
    assert.ok(header?.kid);

    const jwksResponse = await request(app)
      .get('/.well-known/jwks.json')
      .expect(200);
    const published = jwksResponse.body.keys.find(
      (jwk: { kid: string }) => jwk.kid === header?.kid,
    );
    assert.ok(published);

    const publicKey = createPublicKey({ key: published, format: 'jwk' });
    const claims = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'auth-service',
    }) as jwt.JwtPayload;

    assert.ok(claims.sub);
    assert.ok(claims.jti);
    assert.strictEqual(claims.type, 'access');
    assert.ok(claims.exp);
  });
});
