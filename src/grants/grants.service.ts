import { Model, Types } from 'mongoose';

import type { Application, ApplicationsPort } from '../applications';
import { AuditEvent, AuditPort, AuditResult } from '../audit';
import { EMAIL_REGEX } from '../common/constants/regex';
import { normalizeEmail } from '../common/email';
import { Roles } from '../common/enums/roles.enum';
import { ForbiddenError } from '../common/exceptions/auth.exceptions';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { isDuplicateKeyError } from '../common/mongo/duplicate-key';
import { assertObjectId } from '../common/validators/object-id';
import type { InvitationsPort } from '../links';
import type { UsersPort } from '../users';
import { Grant, GrantRoles } from './grants.interface';
import type {
  AssignRoleInput,
  GrantApplicationScope,
  GrantedApplication,
  GrantedMember,
  GrantMemberInput,
  GrantsPort,
} from './grants.port';

export class GrantsService implements GrantsPort {
  private invitations?: InvitationsPort;

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

  /**
   * Grants a role by email: an existing account gets (or converges to) the
   * grant, and an email without an account receives an invitation. The
   * response body is identical in both cases; the resulting grant or pending
   * invitation is visible to the application admins by design.
   */
  async grantMemberByEmail(input: GrantMemberInput): Promise<GrantedMember> {
    const email = normalizeEmail(input.email ?? '');

    if (!EMAIL_REGEX.test(email)) {
      throw new InvalidArgumentError('Invalid email format');
    }
    assertObjectId(input.applicationId, 'applicationId');
    if (!Object.values(GrantRoles).includes(input.role)) {
      throw new InvalidArgumentError('Invalid role');
    }

    const application = await this.applicationsService.findAssignableById(
      input.applicationId,
    );
    if (!application) {
      throw new EntityNotFoundError('Application not found');
    }

    const isOwner = input.actorRole === Roles.OWNER;

    if (input.role === GrantRoles.ADMIN && !isOwner) {
      throw new ForbiddenError('Only the owner can grant the admin role');
    }

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      try {
        return await this.inviteMember({
          email,
          applicationId: input.applicationId,
          role: input.role,
          application,
        });
      } catch (error) {
        // A signup can land between the lookup and the invitation: retry the
        // grant path instead of failing with the generic invitation error.
        if (error instanceof InvalidArgumentError) {
          const created = await this.usersService.findByEmail(email);
          if (created) {
            return this.grantExistingUser(
              input,
              created._id.toString(),
              isOwner,
            );
          }
        }
        throw error;
      }
    }

    return this.grantExistingUser(input, user._id.toString(), isOwner);
  }

  private async grantExistingUser(
    input: GrantMemberInput,
    userId: string,
    isOwner: boolean,
  ): Promise<GrantedMember> {
    const existing = await this.grantModel.findOne({
      userId: new Types.ObjectId(userId),
      applicationId: new Types.ObjectId(input.applicationId),
    });

    if (!isOwner && existing?.role === GrantRoles.ADMIN) {
      throw new ForbiddenError('Only the owner can manage an admin member');
    }

    let grant: Grant | null;

    if (isOwner) {
      grant = await this.upsertGrant(userId, input.applicationId, input.role);
    } else {
      // Apply the admin guard in the write itself: a concurrent promotion to
      // admin must not be overwritten by a non-owner caller.
      try {
        grant = await this.grantModel.findOneAndUpdate(
          {
            userId: new Types.ObjectId(userId),
            applicationId: new Types.ObjectId(input.applicationId),
            role: { $ne: GrantRoles.ADMIN },
          },
          { $set: { role: input.role } },
          {
            upsert: true,
            returnDocument: 'after',
            setDefaultsOnInsert: true,
          },
        );
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new ForbiddenError('Only the owner can manage an admin member');
        }
        throw error;
      }
    }

    if (!grant) {
      throw new EntityNotFoundError('Grant not found');
    }

    await this.recordGrantEvent(AuditEvent.MEMBER_GRANTED, {
      targetUserId: userId,
      applicationId: input.applicationId,
      role: input.role,
      ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
    });

    return { email: normalizeEmail(input.email ?? ''), role: input.role };
  }

  setInvitationsPort(invitations: InvitationsPort): void {
    this.invitations = invitations;
  }

  private async inviteMember(input: {
    email: string;
    applicationId: string;
    role: GrantRoles;
    application: Application;
  }): Promise<GrantedMember> {
    if (!this.invitations) {
      throw new Error('Invitations port is not configured');
    }

    await this.invitations.inviteMember(input);

    return { email: input.email, role: input.role };
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
