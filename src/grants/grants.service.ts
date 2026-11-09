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
import {
  buildPaginatedResult,
  buildSortObject,
  type ListQuery,
  type PaginatedResult,
} from '../common/pagination';
import { assertObjectId } from '../common/validators/object-id';
import type { InvitationsPort } from '../links';
import { USERS_COLLECTION_NAME, type UsersPort } from '../users';
import { Grant, GrantRoles } from './grants.interface';
import type {
  AssignRoleInput,
  GrantApplicationScope,
  GrantedApplication,
  GrantedMember,
  GrantMember,
  GrantMemberInput,
  GrantMemberSortField,
  MemberMutationInput,
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
    // Controller callers always provide the global role; an app admin cannot
    // escalate a member to admin through the legacy PUT route. Internal
    // callers that omit it (already authorized invitation acceptance) keep the
    // previous behaviour.
    if (
      role === GrantRoles.ADMIN &&
      input.actorRole !== undefined &&
      input.actorRole !== Roles.OWNER
    ) {
      throw new ForbiddenError('Only the owner can grant the admin role');
    }

    // The caller decides whether an archived application is still manageable,
    // so the owner keeps administering its grants after the archive.
    await this.resolveApplication(applicationId, scope);

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    if (input.actorRole !== undefined) {
      const existing = await this.grantModel.findOne({
        userId: new Types.ObjectId(userId),
        applicationId: new Types.ObjectId(applicationId),
      });
      if (existing !== null) {
        this.assertMemberEscalation(existing.role, role, input.actorRole);
      }
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

  async assignRoleIfAbsent(input: AssignRoleInput): Promise<boolean> {
    const { userId, applicationId, role, actorId } = input;
    assertObjectId(userId, 'userId');
    assertObjectId(applicationId, 'applicationId');
    if (!Object.values(GrantRoles).includes(role)) {
      throw new InvalidArgumentError('Invalid role');
    }

    await this.resolveApplication(applicationId);

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    try {
      await this.grantModel.create({
        userId: new Types.ObjectId(userId),
        applicationId: new Types.ObjectId(applicationId),
        role,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return false;
      }
      throw error;
    }

    await this.recordGrantEvent(AuditEvent.GRANT_ASSIGNED, {
      targetUserId: userId,
      applicationId,
      role,
      ...(actorId === undefined ? {} : { actorId }),
    });

    return true;
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
          ...(input.actorRole === undefined
            ? {}
            : { actorRole: input.actorRole }),
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
        if (!isDuplicateKeyError(error)) {
          throw error;
        }

        // Two causes: the target already holds an admin grant, or a concurrent
        // non-owner insert won the unique index. Re-read to tell them apart.
        const current = await this.grantModel.findOne({
          userId: new Types.ObjectId(userId),
          applicationId: new Types.ObjectId(input.applicationId),
        });

        if (current?.role === GrantRoles.ADMIN) {
          throw new ForbiddenError('Only the owner can manage an admin member');
        }

        grant = await this.grantModel.findOneAndUpdate(
          {
            userId: new Types.ObjectId(userId),
            applicationId: new Types.ObjectId(input.applicationId),
            role: { $ne: GrantRoles.ADMIN },
          },
          { $set: { role: input.role } },
          { returnDocument: 'after' },
        );

        if (!grant) {
          throw new ForbiddenError('Only the owner can manage an admin member');
        }
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

  async changeMemberRole(
    input: MemberMutationInput & { role: GrantRoles },
  ): Promise<Grant> {
    const { userId, applicationId, role, actorId, actorRole } = input;
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

    const existing = await this.grantModel.findOne({
      userId: new Types.ObjectId(userId),
      applicationId: new Types.ObjectId(applicationId),
    });
    if (!existing) {
      throw new EntityNotFoundError('Grant not found');
    }
    this.assertMemberEscalation(existing.role, role, actorRole);

    const writeFilter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      applicationId: new Types.ObjectId(applicationId),
      // A concurrent promotion to admin must not be overwritten by a non-owner.
      ...(actorRole === Roles.OWNER ? {} : { role: { $ne: GrantRoles.ADMIN } }),
    };
    let grant = await this.grantModel.findOneAndUpdate(
      writeFilter,
      { $set: { role } },
      { returnDocument: 'after' },
    );
    if (!grant) {
      const current = await this.grantModel.exists({
        userId: new Types.ObjectId(userId),
        applicationId: new Types.ObjectId(applicationId),
      });
      if (!current) {
        throw new EntityNotFoundError('Grant not found');
      }
      throw new ForbiddenError('Only the owner can manage an admin member');
    }

    await this.recordGrantEvent(AuditEvent.MEMBER_GRANTED, {
      targetUserId: userId,
      applicationId,
      role,
      ...(actorId === undefined ? {} : { actorId }),
    });

    return grant;
  }

  async removeMember(input: MemberMutationInput): Promise<void> {
    const { userId, applicationId, actorId, actorRole } = input;
    assertObjectId(userId, 'userId');
    assertObjectId(applicationId, 'applicationId');

    const application =
      await this.applicationsService.findAssignableById(applicationId);
    if (!application) {
      throw new EntityNotFoundError('Application not found');
    }

    const existing = await this.grantModel.findOne({
      userId: new Types.ObjectId(userId),
      applicationId: new Types.ObjectId(applicationId),
    });
    if (!existing) {
      throw new EntityNotFoundError('Grant not found');
    }
    this.assertMemberEscalation(existing.role, existing.role, actorRole);

    const removed = await this.grantModel.deleteOne({
      _id: existing._id,
      ...(actorRole === Roles.OWNER ? {} : { role: { $ne: GrantRoles.ADMIN } }),
    });
    if (removed.deletedCount === 0) {
      const current = await this.grantModel.exists({ _id: existing._id });
      if (!current) {
        throw new EntityNotFoundError('Grant not found');
      }
      throw new ForbiddenError('Only the owner can manage an admin member');
    }

    await this.recordGrantEvent(AuditEvent.MEMBER_REVOKED, {
      targetUserId: userId,
      applicationId,
      ...(actorId === undefined ? {} : { actorId }),
    });
  }

  /** Only the owner may create, modify or remove an admin member. */
  private assertMemberEscalation(
    currentRole: GrantRoles,
    nextRole: GrantRoles,
    actorRole?: Roles,
  ): void {
    if (
      (currentRole === GrantRoles.ADMIN || nextRole === GrantRoles.ADMIN) &&
      actorRole !== Roles.OWNER
    ) {
      throw new ForbiddenError('Only the owner can manage an admin member');
    }
  }

  setInvitationsPort(invitations: InvitationsPort): void {
    this.invitations = invitations;
  }

  private async inviteMember(input: {
    email: string;
    applicationId: string;
    role: GrantRoles;
    application: Application;
    actorRole?: Roles;
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

  async listMembers(
    applicationId: string,
    query: ListQuery<GrantMemberSortField>,
    scope?: GrantApplicationScope,
  ): Promise<PaginatedResult<GrantMember>> {
    assertObjectId(applicationId, 'applicationId');
    await this.resolveApplication(applicationId, scope);

    const applicationObjectId = new Types.ObjectId(applicationId);
    // Match and sort on the base collection so the compound indexes serve the
    // ordering, then join users to drop orphan grants and finally skip/limit on
    // that hydratable set. The count runs the same existence filter, so `total`
    // always describes the set the pages are drawn from even with orphans.
    const userLookup = {
      $lookup: {
        from: USERS_COLLECTION_NAME,
        let: { userId: '$userId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
          // Only existence matters here; the safe profile fields are loaded
          // through UsersPort once the page is bounded.
          { $project: { _id: 1 } },
        ],
        as: 'user',
      },
    };

    // One shared lookup feeds both the page and the count: `$facet` splits the
    // hydratable grants after the index-backed sort and the orphan filter.
    const [facet] = await this.grantModel.aggregate<{
      items: Array<{
        userId: string;
        role: GrantRoles;
        createdAt?: Date;
      }>;
      total: Array<{ value: number }>;
    }>(
      [
        { $match: { applicationId: applicationObjectId } },
        { $sort: buildSortObject(query.sort) },
        userLookup,
        { $unwind: '$user' },
        {
          $facet: {
            items: [
              { $skip: (query.page - 1) * query.limit },
              { $limit: query.limit },
              {
                $project: {
                  _id: 0,
                  userId: { $toString: '$userId' },
                  role: 1,
                  // The membership date, matching the `createdAt` ordering.
                  createdAt: 1,
                },
              },
            ],
            total: [{ $count: 'value' }],
          },
        },
      ],
      { allowDiskUse: true },
    );

    const page = facet?.items ?? [];
    const summaries = await this.usersService.findSummariesByIds(
      page.map((grant) => grant.userId),
    );
    const byUserId = new Map(
      summaries.map((summary) => [summary.userId, summary]),
    );
    const items = page.flatMap((grant): GrantMember[] => {
      const summary = byUserId.get(grant.userId);
      if (!summary) {
        return [];
      }

      return [
        {
          ...summary,
          userId: grant.userId,
          role: grant.role,
          ...(grant.createdAt === undefined
            ? {}
            : { createdAt: grant.createdAt }),
        },
      ];
    });

    return buildPaginatedResult(items, facet?.total[0]?.value ?? 0, query);
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
    actorRole?: Roles,
  ): Promise<void> {
    assertObjectId(userId, 'userId');
    assertObjectId(applicationId, 'applicationId');

    const existing = await this.grantModel.findOne({
      userId: new Types.ObjectId(userId),
      applicationId: new Types.ObjectId(applicationId),
    });
    if (!existing) {
      throw new EntityNotFoundError('Grant not found');
    }
    this.assertMemberEscalation(existing.role, existing.role, actorRole);

    const result = await this.grantModel.deleteOne({
      _id: existing._id,
      ...(actorRole === Roles.OWNER ? {} : { role: { $ne: GrantRoles.ADMIN } }),
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
