import { describe, test, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { getTestAppInstance } from '../utils/app';
import { Application } from 'express';

describe('Healthcheck Endpoint', () => {
  let app: Application;
  before(async () => {
    app = await getTestAppInstance();
  });

  test('GET /healthcheck should return 200 OK', async () => {
    const response = await request(app).get('/v1/health');
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body, { status: 'ok' });
  });
});
