import { Application } from 'express';
import request from 'supertest';

import { getTestAppInstance } from '../../utils/app';

describe('E2E Auth Tenant Login removed', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('POST /auth/tenant/login should respond 404', async () => {
    await request(app)
      .post('/auth/tenant/login')
      .send({ tenantId: 'tenant-id', tenantSecret: 'tenant-secret' })
      .expect(404);
  });
});
