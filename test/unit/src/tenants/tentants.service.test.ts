import { TenantsService } from '../../../../src/tenants/tenants.service';
import { TenantsModel } from '../../../../src/tenants/tenants.schema';
import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import fixture from '../../../fixtures/model.register';
import { DEFAULT_TENANT_ID } from '../../../fixtures/defaults/tenant.default';

describe('TenantsService', () => {
  let tenantsService: TenantsService;

  before(() => {
    tenantsService = new TenantsService(TenantsModel);
  });

  describe('findById', () => {
    test('should throw an error if id is not provided', async () => {
      await assert.rejects(
        tenantsService.findById(''),
        new InvalidArgumentError('Tenant ID is required'),
      );
    });

    test('should throw an error if id format is invalid', async () => {
      await assert.rejects(
        tenantsService.findById('invalid-id'),
        new InvalidArgumentError('Invalid Tenant ID format'),
      );
    });

    test('should return tenant if id is valid', async () => {
      await fixture.create('Tenant');

      const tenant = await tenantsService.findById(String(DEFAULT_TENANT_ID));
      assert.strictEqual(String(tenant?._id), String(DEFAULT_TENANT_ID));
      assert.strictEqual(tenant?.name, 'Default Tenant');
      assert.strictEqual(tenant?.active, true);
      assert.strictEqual(
        tenant?.description,
        'This is the default tenant for testing purposes',
      );
    });
  });
});
