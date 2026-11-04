import { Model, Types } from 'mongoose';

import type { Application, ApplicationsPort } from '../applications';
import { AuditEvent, AuditPort, AuditResult } from '../audit';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { isDuplicateKeyError } from '../common/mongo/duplicate-key';
import { assertObjectId } from '../common/validators/object-id';
import type { UsersPort } from '../users';
import { Grant, GrantRoles } from './grants.interface';
import type {
  AssignRoleInput,
  GrantApplicationScope,
  GrantedApplication,
  GrantsPort,
} from './grants.port';

export class GrantsService implements GrantsPort {
  constructor(
    private readonly grantModel: Model<Grant>,
    private readonly applicationsService: ApplicationsPort,
    private readonly usersService: UsersPort,
    private readonly auditService?: AuditPort,
  ) {}

  async assignRole(
    input: AssignRoleInput,
    scope?: GrantApplicationScope,
  ): Promise<Grant> {
    const { userId, applicationId, role, actorId } = input;
    assertObjectId(userId, 'userId');
    assertObjectId(applicationId, 'applicationId');
    if (!Object.values(GrantRoles).includes(role)) {
      throw new InvalidArgumentError('Invalid role');
    }

    // The caller decides whether an archived application is still manageable,
    // so the owner keeps administering its grants after the archive.
    await this.resolveApplication(applicationId, scope);

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    const grant = await this.upsertGrant(userId, applicationId, role);
    if (!grant) {
      throw new EntityNotFoundError('Grant not found');
    }

    await this.recordGrantEvent(AuditEvent.GRANT_ASSIGNED, {
      targetUserId: userId,
      applicationId,
      role,
      ...(actorId === undefined ? {} : { actorId }),
    });

    return grant;
  }

  async findByUserAndApplication(
    userId: string,
    applicationId: string,
    scope?: GrantApplicationScope,
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

    const application = await this.findApplication(applicationId, scope);

    if (!application || (!scope?.includeArchived && !application.active)) {
      return null;
    }

    return grant;
  }

  async listByUser(userId: string): Promise<Grant[]> {
    return (await this.loadActiveGrants(userId)).map(({ grant }) => grant);
  }

  async listActiveByUser(userId: string): Promise<GrantedApplication[]> {
    return (await this.loadActiveGrants(userId)).map(
      ({ grant, application }) => ({ application, role: grant.role }),
    );
  }

  async listByApplication(
    applicationId: string,
    scope?: GrantApplicationScope,
  ): Promise<Grant[]> {
    assertObjectId(applicationId, 'applicationId');

    await this.resolveApplication(applicationId, scope);

    return this.grantModel.find({
      applicationId: new Types.ObjectId(applicationId),
    });
  }

  async revokeRole(
    userId: string,
    applicationId: string,
    actorId?: string,
  ): Promise<void> {
    assertObjectId(userId, 'userId');
    assertObjectId(applicationId, 'applicationId');

    const result = await this.grantModel.deleteOne({
      userId: new Types.ObjectId(userId),
      applicationId: new Types.ObjectId(applicationId),
    });

    if (result.deletedCount === 0) {
      throw new EntityNotFoundError('Grant not found');
    }

    await this.recordGrantEvent(AuditEvent.GRANT_REVOKED, {
      targetUserId: userId,
      applicationId,
      ...(actorId === undefined ? {} : { actorId }),
    });
  }

  async deleteByUser(userId: string, actorId?: string): Promise<void> {
    assertObjectId(userId, 'userId');

    const grants = await this.grantModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('applicationId')
      .lean();

    await this.grantModel.deleteMany({
      userId: new Types.ObjectId(userId),
    });

    // Deleting a user cascades into every grant; record each removal so the
    // audit trail does not depend on the HTTP route that triggered it.
    for (const grant of grants) {
      await this.recordGrantEvent(AuditEvent.GRANT_REVOKED, {
        targetUserId: userId,
        applicationId: grant.applicationId.toString(),
        ...(actorId === undefined ? {} : { actorId }),
      });
    }
  }

  private async findApplication(
    applicationId: string,
    scope?: GrantApplicationScope,
  ): Promise<Application | null> {
    if (scope?.application) {
      return scope.application;
    }

    return scope?.includeArchived
      ? this.applicationsService.findById(applicationId)
      : this.applicationsService.findAssignableById(applicationId);
  }

  private async resolveApplication(
    applicationId: string,
    scope?: GrantApplicationScope,
  ): Promise<Application> {
    const application = await this.findApplication(applicationId, scope);

    if (!application) {
      throw new EntityNotFoundError('Application not found');
    }

    return application;
  }

  /**
   * Single source of truth for "grants of this user on active applications".
   * Both public projections share it so the activity filter cannot drift.
   */
  private async loadActiveGrants(
    userId: string,
  ): Promise<Array<{ grant: Grant; application: Application }>> {
    assertObjectId(userId, 'userId');

    const grants = await this.grantModel.find({
      userId: new Types.ObjectId(userId),
    });

    const activeApplications = await this.applicationsService.findActiveByIds(
      grants.map((grant) => grant.applicationId.toString()),
    );
    const applicationsById = new Map(
      activeApplications.map((application) => [
        application._id.toString(),
        application,
      ]),
    );

    // Ordering belongs to the consumer that renders the list, not to the
    // projection: keeping it here would duplicate the comparator in the panel
    // and the catalog endpoints.
    return grants.flatMap((grant) => {
      const application = applicationsById.get(grant.applicationId.toString());

      return application ? [{ grant, application }] : [];
    });
  }

  private async recordGrantEvent(
    event: AuditEvent,
    input: {
      targetUserId: string;
      applicationId: string;
      role?: string;
      actorId?: string;
    },
  ): Promise<void> {
    if (!this.auditService) {
      return;
    }

    await this.auditService.record({
      event,
      result: AuditResult.SUCCESS,
      ...input,
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
