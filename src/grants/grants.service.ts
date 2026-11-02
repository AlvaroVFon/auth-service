import { Model, Types } from 'mongoose';

import type { Application, ApplicationsPort } from '../applications';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { isDuplicateKeyError } from '../common/mongo/duplicate-key';
import { assertObjectId } from '../common/validators/object-id';
import type { UsersPort } from '../users';
import { Grant, GrantRoles } from './grants.interface';
import type { AssignRoleInput, GrantsPort } from './grants.port';

export class GrantsService implements GrantsPort {
  constructor(
    private readonly grantModel: Model<Grant>,
    private readonly applicationsService: ApplicationsPort,
    private readonly usersService: UsersPort,
  ) {}

  async assignRole(input: AssignRoleInput): Promise<Grant> {
    const { userId, applicationId, role } = input;
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
    loadedApplication?: Application,
  ): Promise<Grant | null> {
    assertObjectId(userId, 'userId');
    assertObjectId(applicationId, 'applicationId');

    const grant = await this.grantModel.findOne({
      userId: new Types.ObjectId(userId),
      applicationId: new Types.ObjectId(applicationId),
    });

    if (!grant) {
      return null;
    }

    const application =
      loadedApplication ??
      (await this.applicationsService.findAssignableById(applicationId));

    return application?.active ? grant : null;
  }

  async listByUser(userId: string): Promise<Grant[]> {
    assertObjectId(userId, 'userId');

    const grants = await this.grantModel.find({
      userId: new Types.ObjectId(userId),
    });

    const activeApplications = await this.applicationsService.findActiveByIds(
      grants.map((grant) => grant.applicationId.toString()),
    );
    const activeIds = new Set(
      activeApplications.map((application) => application._id.toString()),
    );

    return grants.filter((grant) =>
      activeIds.has(grant.applicationId.toString()),
    );
  }

  async listByApplication(applicationId: string): Promise<Grant[]> {
    assertObjectId(applicationId, 'applicationId');

    const application =
      await this.applicationsService.findAssignableById(applicationId);
    if (!application) {
      throw new EntityNotFoundError('Application not found');
    }

    return this.grantModel.find({
      applicationId: new Types.ObjectId(applicationId),
    });
  }

  async revokeRole(userId: string, applicationId: string): Promise<void> {
    assertObjectId(userId, 'userId');
    assertObjectId(applicationId, 'applicationId');

    const result = await this.grantModel.deleteOne({
      userId: new Types.ObjectId(userId),
      applicationId: new Types.ObjectId(applicationId),
    });

    if (result.deletedCount === 0) {
      throw new EntityNotFoundError('Grant not found');
    }
  }

  async deleteByUser(userId: string): Promise<void> {
    assertObjectId(userId, 'userId');

    await this.grantModel.deleteMany({
      userId: new Types.ObjectId(userId),
    });
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
    const options = {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true,
    } as const;

    try {
      return await this.grantModel.findOneAndUpdate(filter, update, options);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      // A concurrent writer inserted the pair first: retry the upsert so we
      // converge on its grant (or recreate it if it was removed meanwhile).
      return this.grantModel.findOneAndUpdate(filter, update, options);
    }
  }
}
