import { Application } from 'express';
import request from 'supertest';

import { getTestAppInstance } from '../utils/app';

describe('E2E Security middleware', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should allow a configured origin', async () => {
    const response = await request(app)
      .get('/not-a-route')
      .set('Origin', 'http://allowed.test')
      .expect(404);

    assert.strictEqual(
      response.headers['access-control-allow-origin'],
      'http://allowed.test',
    );
  });

  test('should answer the preflight for a configured origin', async () => {
    const response = await request(app)
      .options('/auth/login')
      .set('Origin', 'http://allowed.test')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);

    assert.strictEqual(
      response.headers['access-control-allow-origin'],
      'http://allowed.test',
    );
  });

  test('should not allow an unknown origin', async () => {
    const response = await request(app)
      .get('/not-a-route')
      .set('Origin', 'http://unknown.test')
      .expect(404);

    assert.strictEqual(
      response.headers['access-control-allow-origin'],
      undefined,
    );
  });

  test('should hide the server header and send security headers', async () => {
    const response = await request(app).get('/not-a-route').expect(404);

    assert.strictEqual(response.headers['x-powered-by'], undefined);
    assert.strictEqual(response.headers['x-content-type-options'], 'nosniff');
  });
});
