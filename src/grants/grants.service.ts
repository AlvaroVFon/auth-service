import { Model, Types } from 'mongoose';

import type { ApplicationsPort } from '../applications';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { isDuplicateKeyError } from '../common/mongo/duplicate-key';
import { assertObjectId } from '../common/validators/object-id';
import type { UsersPort } from '../users';
import { Grant, GrantRoles } from './grants.interface';
import type { GrantsPort } from './grants.port';

export class GrantsService implements GrantsPort {
  constructor(
    private readonly grantModel: Model<Grant>,
    private readonly applicationsService: ApplicationsPort,
    private readonly usersService: UsersPort,
  ) {}

  async assignRole(
    userId: string,
    applicationId: string,
    role: GrantRoles,
  ): Promise<Grant> {
    assertObjectId(userId, 'userId');
    assertObjectId(applicationId, 'applicationId');
    if (!Object.values(GrantRoles).includes(role)) {
      throw new InvalidArgumentError('Invalid role');
    }

    const application =
      await this.applicationsService.findAssignableById(applicationId);
    if (!application) {
      throw new EntityNotFoundError('Application not found');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    const grant = await this.upsertGrant(userId, applicationId, role);
    if (!grant) {
      throw new EntityNotFoundError('Grant not found');
    }

    return grant;
  }

  async findByUserAndApplication(
    userId: string,
    applicationId: string,
  ): Promise<Grant | null> {
    assertObjectId(userId, 'userId');
    assertObjectId(applicationId, 'applicationId');

    return this.grantModel.findOne({
      userId: new Types.ObjectId(userId),
      applicationId: new Types.ObjectId(applicationId),
    });
  }

  async listByUser(userId: string): Promise<Grant[]> {
    assertObjectId(userId, 'userId');

    return this.grantModel.find({ userId: new Types.ObjectId(userId) });
  }

  private async upsertGrant(
    userId: string,
    applicationId: string,
    role: GrantRoles,
  ): Promise<Grant | null> {
    const filter = {
      userId: new Types.ObjectId(userId),
      applicationId: new Types.ObjectId(applicationId),
    };
    const update = { $set: { role } };

    try {
      return await this.grantModel.findOneAndUpdate(filter, update, {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      // A concurrent writer inserted the pair first: converge on its grant.
      return this.grantModel.findOneAndUpdate(filter, update, {
        returnDocument: 'after',
      });
    }
  }
}
