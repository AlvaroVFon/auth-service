import type { Model } from 'mongoose';

import { OBJECTID_REGEX } from '../common/constants/regex';
import { UnauthorizedError } from '../common/exceptions/auth.exceptions';
import { InvalidArgumentError } from '../common/exceptions/base.exception';
import { Tenant } from './tenants.interface';
import type { TenantsPort } from './tenants.port';

export class TenantsService implements TenantsPort {
  constructor(private readonly tenantsModel: Model<Tenant>) {}

  async verifyCredentials(
    tenantId: string,
    tenantSecret: string,
  ): Promise<Tenant> {
    if (!tenantId) {
      throw new InvalidArgumentError('Tenant ID is required');
    }
    if (!OBJECTID_REGEX.test(tenantId)) {
      throw new InvalidArgumentError('Tenant ID is invalid');
    }
    if (!tenantSecret) {
      throw new InvalidArgumentError('Tenant secret is required');
    }

    const tenant = await this.tenantsModel.findById(tenantId).lean().exec();

    if (!tenant || !tenant.active || tenant.secret !== tenantSecret) {
      throw new UnauthorizedError('Invalid credentials');
    }

    return tenant;
  }

  async findById(id: string): Promise<Tenant | null> {
    if (!id) {
      throw new InvalidArgumentError('Tenant ID is required');
    }
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('Invalid Tenant ID format');
    }

    return this.tenantsModel.findById(id).lean().exec();
  }
}
