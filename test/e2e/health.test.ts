import { Application } from 'express';
import request from 'supertest';

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
});
