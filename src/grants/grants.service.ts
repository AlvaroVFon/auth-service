import { Model, Types } from 'mongoose';

import { ApplicationsPort } from '../applications';
import { OBJECTID_REGEX } from '../common/constants/regex';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { Grant, GrantRoles } from './grants.interface';
import type { GrantsPort } from './grants.port';

export class GrantsService implements GrantsPort {
  constructor(
    private readonly grantModel: Model<Grant>,
    private readonly applicationsService: ApplicationsPort,
  ) {}

  async assignRole(
    userId: string,
    applicationId: string,
    role: GrantRoles,
  ): Promise<Grant> {
    this.assertObjectId(userId, 'userId');
    this.assertObjectId(applicationId, 'applicationId');
    if (!Object.values(GrantRoles).includes(role)) {
      throw new InvalidArgumentError('Invalid role');
    }

    const application =
      await this.applicationsService.findAssignableById(applicationId);
    if (!application) {
      throw new EntityNotFoundError('Application not found');
    }

    const grant = await this.grantModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        applicationId: new Types.ObjectId(applicationId),
      },
      { $set: { role } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );

    if (!grant) {
      throw new EntityNotFoundError('Grant not found');
    }

    return grant;
  }

  async findByUserAndApplication(
    userId: string,
    applicationId: string,
  ): Promise<Grant | null> {
    this.assertObjectId(userId, 'userId');
    this.assertObjectId(applicationId, 'applicationId');

    return this.grantModel.findOne({
      userId: new Types.ObjectId(userId),
      applicationId: new Types.ObjectId(applicationId),
    });
  }

  async listByUser(userId: string): Promise<Grant[]> {
    this.assertObjectId(userId, 'userId');

    return this.grantModel.find({ userId: new Types.ObjectId(userId) });
  }

  private assertObjectId(value: string, name: string): void {
    if (!value) {
      throw new InvalidArgumentError(`${name} is required`);
    }
    if (!OBJECTID_REGEX.test(value)) {
      throw new InvalidArgumentError('Invalid ID format');
    }
  }
}
