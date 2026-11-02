import { Application } from 'express';
import request from 'supertest';

import {
  createAppTestInstanceFromEnvironment,
  getTestAppInstance,
} from '../utils/app';

const withCorsOrigins = async (
  value: string | undefined,
  run: () => Promise<void>,
) => {
  const original = process.env.CORS_ORIGINS;

  if (value === undefined) {
    delete process.env.CORS_ORIGINS;
  } else {
    process.env.CORS_ORIGINS = value;
  }

  try {
    await run();
  } finally {
    if (original === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = original;
    }
  }
};

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
    assert.strictEqual(response.headers['access-control-max-age'], '600');
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

  test('should read and normalize the allowlist from the environment', async () => {
    await withCorsOrigins('HTTP://ENV-ALLOWED.TEST/', async () => {
      const environmentApp = createAppTestInstanceFromEnvironment();

      const response = await request(environmentApp)
        .get('/not-a-route')
        .set('Origin', 'http://env-allowed.test')
        .expect(404);

      assert.strictEqual(
        response.headers['access-control-allow-origin'],
        'http://env-allowed.test',
      );
    });
  });

  test('should reject every origin when CORS_ORIGINS is not configured', async () => {
    await withCorsOrigins(undefined, async () => {
      const environmentApp = createAppTestInstanceFromEnvironment();

      const response = await request(environmentApp)
        .get('/not-a-route')
        .set('Origin', 'http://allowed.test')
        .expect(404);

      assert.strictEqual(
        response.headers['access-control-allow-origin'],
        undefined,
      );
    });
  });

  test('should hide the server header and send security headers', async () => {
    const response = await request(app).get('/not-a-route').expect(404);

    assert.strictEqual(response.headers['x-powered-by'], undefined);
    assert.strictEqual(response.headers['x-content-type-options'], 'nosniff');
  });
});
