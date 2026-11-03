import { Application } from 'express';
import request from 'supertest';

import { getTestAppInstance } from '../../utils/app';

describe('E2E client error mapping', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should return 400 for a malformed JSON body', async () => {
    const response = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "broken"');

    assert.strictEqual(response.status, 400);
    assert.deepStrictEqual(response.body, { message: 'Bad Request' });
  });

  test('should return 413 for an oversized JSON body', async () => {
    const response = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: `${'a'.repeat(110 * 1024)}@example.com` }));

    assert.strictEqual(response.status, 413);
    assert.deepStrictEqual(response.body, { message: 'Payload Too Large' });
  });
});
