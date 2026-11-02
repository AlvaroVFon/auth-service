import { Application } from 'express';
import request from 'supertest';

import { GLOBAL_RATE_LIMIT_MAX } from '../../src/common/middlewares/rate-limiter.middleware';
import { getTestAppInstance } from '../utils/app';

describe('E2E Health', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('GET /health should report liveness', async () => {
    const response = await request(app).get('/health').expect(200);

    assert.deepStrictEqual(response.body, { status: 'ok' });
  });

  test('GET /ready should report readiness when MongoDB is connected', async () => {
    const response = await request(app).get('/ready').expect(200);

    assert.deepStrictEqual(response.body, { status: 'ready' });
  });

  test('GET /health should survive a burst beyond the global rate limit', async () => {
    const requests = GLOBAL_RATE_LIMIT_MAX + 30;

    for (let index = 0; index < requests; index += 1) {
      await request(app).get('/health').expect(200);
    }
  });
});
