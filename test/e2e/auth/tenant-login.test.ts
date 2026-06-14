import { Application } from 'express';
import request from 'supertest';
import { getTestAppInstance } from '../../utils/app';
import fixture from '../../fixtures/model.register';
import { Tenant } from '../../../src/tenants/tentants.interface';
import { JWT_REGEX } from '../../../src/common/constants/regex';
import { MotherFactory } from '../../helpers/factories/mother.factory';

describe('E2E Auth Tenant Login', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should login tenant with valid credentials', async () => {
    const tenant = await fixture.create<Tenant>('Tenant');

    const response = await request(app)
      .post('/auth/tenant/login')
      .send({
        tenantId: tenant._id.toString(),
        tenantSecret: tenant.secret,
      })
      .expect(200);

    assert.ok(response.body.token);
    assert.match(response.body.token, JWT_REGEX);
  });

  test('should fail login with invalid tenantId', async () => {
    const tenantId = String(MotherFactory.objectId());
    const response = await request(app)
      .post('/auth/tenant/login')
      .send({
        tenantId,
        tenantSecret: 'some-secret',
      })
      .expect(401);

    assert.equal(response.body.message, 'Invalid credentials');
  });

  test('should fail login with invalid tenantSecret', async () => {
    const tenant = await fixture.create<Tenant>('Tenant');

    const response = await request(app)
      .post('/auth/tenant/login')
      .send({
        tenantId: String(tenant._id),
        tenantSecret: 'invalid-secret',
      })
      .expect(401);

    assert.equal(response.body.message, 'Invalid credentials');
  });
});
