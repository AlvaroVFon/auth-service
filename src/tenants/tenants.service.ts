import { OBJECTID_REGEX } from '../common/constants/regex';
import { InvalidArgumentError } from '../common/exceptions/base.exception';
import { Tenant } from './tentants.interface';
import type { Model } from 'mongoose';

export class TenantsService {
  constructor(private readonly tenantsModel: Model<Tenant>) {}

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
