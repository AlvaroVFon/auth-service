import { AuthTenantService } from '../../../../../src/auth/services/auth-tenant.service';
import { JWT_REGEX } from '../../../../../src/common/constants/regex';
import { UnauthorizedError } from '../../../../../src/common/exceptions/auth.exceptions';
import { InvalidArgumentError } from '../../../../../src/common/exceptions/base.exception';
import { JwtService } from '../../../../../src/libs/jwt/jwt.service';
import { TenantsModel } from '../../../../../src/tenants/tenants.schema';
import { TenantsService } from '../../../../../src/tenants/tenants.service';
import { Tenant } from '../../../../../src/tenants/tentants.interface';
import fixture from '../../../../fixtures/model.register';
import { MotherFactory } from '../../../../helpers/factories/mother.factory';

describe('AuthTenantService', () => {
  let authTenantService: AuthTenantService;
  let tenantsService: TenantsService;
  let jwtService: JwtService;

  before(async () => {
    tenantsService = new TenantsService(TenantsModel);
    jwtService = new JwtService('test-secret', 3600, 86000);
    authTenantService = new AuthTenantService(tenantsService, jwtService);
  });

  describe('login', () => {
    let tenant: Tenant;

    beforeEach(async () => {
      tenant = await fixture.create(TenantsModel.modelName);
    });

    test('should throw an error if tenantId is not provided', async () => {
      await assert.rejects(
        authTenantService.login({ tenantId: '', tenantSecret: tenant.secret }),
        new InvalidArgumentError('Tenant ID is required'),
      );
    });

    test('should throw an error if tenantId is not a valid ObjectId', async () => {
      await assert.rejects(
        authTenantService.login({
          tenantId: 'invalid-id',
          tenantSecret: tenant.secret,
        }),
        new InvalidArgumentError('Tenant ID is invalid'),
      );
    });

    test('should throw an error if tenantSecret is not provided', async () => {
      await assert.rejects(
        authTenantService.login({
          tenantId: tenant._id.toString(),
          tenantSecret: '',
        }),
        new InvalidArgumentError('Tenant secret is required'),
      );
    });

    test('should throw an error if tenant does not exist', async () => {
      const tenantId = String(MotherFactory.objectId());
      await assert.rejects(
        authTenantService.login({
          tenantId: tenantId,
          tenantSecret: 'wrong-secret',
        }),
        new UnauthorizedError('Invalid credentials'),
      );
    });

    test('should throw an error if tenant secret is incorrect', async () => {
      await assert.rejects(
        authTenantService.login({
          tenantId: String(tenant._id),
          tenantSecret: 'wrong-secret',
        }),
        new UnauthorizedError('Invalid credentials'),
      );
    });

    test('should return tenant access token if credentials are correct', async () => {
      const result = await authTenantService.login({
        tenantId: String(tenant._id),
        tenantSecret: tenant.secret,
      });

      assert.ok(JWT_REGEX.test(result));
    });
  });
});
