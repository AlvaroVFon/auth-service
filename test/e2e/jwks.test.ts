import { createPublicKey } from 'node:crypto';

import { Application } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { JWT_REGEX } from '../../src/common/constants/regex';
import fixture from '../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_PLAIN_PASSWORD,
  DEFAULT_USER_TOKEN,
  generateRandomEmail,
} from '../fixtures/defaults';
import { createApplicationAccess } from '../helpers/application-access';
import { getTestAppInstance } from '../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

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

    const user = await fixture.findOne<{ _id: string }>('User', { email });
    assert.ok(user);
    const { application } = await createApplicationAccess(String(user!._id));

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({
        email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
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

  test('should restrict the key status to the owner', async () => {
    await request(app).get('/jwks/status').expect(401);

    await request(app)
      .get('/jwks/status')
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .expect(403);
  });

  test('should report the active kid and published keys to the owner', async () => {
    const response = await request(app)
      .get('/jwks/status')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(response.headers['cache-control'], 'no-store');
    assert.ok(response.body.activeKid);

    const jwksResponse = await request(app)
      .get('/.well-known/jwks.json')
      .expect(200);
    const publishedKids = jwksResponse.body.keys.map(
      (jwk: { kid: string }) => jwk.kid,
    );

    assert.ok(publishedKids.includes(response.body.activeKid));
    assert.deepStrictEqual(
      response.body.keys.map((key: { kid: string }) => key.kid),
      publishedKids,
    );
    for (const key of response.body.keys) {
      assert.ok(key.kid);
      assert.ok(key.status === 'active' || key.status === 'retired');
      assert.strictEqual(
        new Date(key.publishedAt).toISOString(),
        key.publishedAt,
      );
      assert.strictEqual(key.n, undefined);
      assert.strictEqual(key.d, undefined);
    }
  });
});
