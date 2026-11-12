import { Model, Types } from 'mongoose';

import { EMAIL_REGEX } from '../common/constants/regex';
import { normalizeEmail } from '../common/email';
import { ForbiddenError } from '../common/exceptions/auth.exceptions';
import {
  ConflictError,
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { InvalidLinkError } from '../common/exceptions/links.exceptions';
import {
  buildPaginatedResult,
  buildSortObject,
  type PaginatedResult,
} from '../common/pagination';
import { normalizeTelegramChatId } from '../common/telegram-chat-id';
import { assertObjectId } from '../common/validators/object-id';
import { GrantRoles } from '../grants';
import { generateLinkToken, hashLinkToken } from './link-token';
import { LinkType, OneTimeLink } from './link.interface';
import {
  CreateInvitationLinkInput,
  CreatePasswordResetLinkInput,
  CreatedLink,
  InvitationCounts,
  INVITATION_STATES,
  type InvitationListItem,
  type InvitationListQuery,
  InvalidateLinksFilter,
  LinksPort,
} from './links.port';

const RELEASE_WINDOW_MS = 5 * 60 * 1000;

export class LinksService implements LinksPort {
  constructor(
    private readonly linkModel: Model<OneTimeLink>,
    private readonly invitationExpirationMs: number = 7 * 24 * 60 * 60 * 1000,
    private readonly passwordResetExpirationMs: number = 60 * 60 * 1000,
  ) {}

  async resendInvitation(
    applicationId: string,
    invitationId: string,
    allowAdminInvitation = false,
    expiresInMs?: number,
  ): Promise<CreatedLink> {
    assertObjectId(applicationId, 'applicationId');
    assertObjectId(invitationId, 'invitationId');

    const existing = await this.linkModel.findOne({
      _id: new Types.ObjectId(invitationId),
      applicationId: new Types.ObjectId(applicationId),
      type: LinkType.INVITATION,
    });

    if (!existing) {
      throw new EntityNotFoundError('Invitation not found');
    }
    if (existing.usedAt !== null) {
      throw new ConflictError('Invitation already used');
    }
    if (existing.invalidatedAt !== null) {
      throw new ConflictError('Invitation already revoked');
    }
    if (!existing.email || !existing.role) {
      throw new EntityNotFoundError('Invitation not found');
    }
    if (existing.role === GrantRoles.ADMIN && !allowAdminInvitation) {
      throw new ForbiddenError('Only the owner can resend an admin invitation');
    }

    // createInvitation invalidates every active link of this email and
    // application before inserting the replacement.
    return this.createInvitation({
      email: existing.email,
      applicationId,
      role: existing.role,
      ...(existing.telegramChatId === undefined
        ? {}
        : { telegramChatId: existing.telegramChatId }),
      ...(expiresInMs === undefined ? {} : { expiresInMs }),
    });
  }

  /**
   * Paginated invitation history of one application. The state is computed in
   * the database with the documented precedence (used > invalidated > expired >
   * pending) so filtering and `total` describe the same set.
   */
  async listInvitations(
    applicationId: string,
    query: InvitationListQuery,
  ): Promise<PaginatedResult<InvitationListItem>> {
    assertObjectId(applicationId, 'applicationId');

    if (
      query.state !== undefined &&
      !(INVITATION_STATES as readonly string[]).includes(query.state)
    ) {
      throw new InvalidArgumentError('Invalid invitation state');
    }

    const now = new Date();
    const stateExpression = {
      $cond: [
        { $ne: ['$usedAt', null] },
        'used',
        {
          $cond: [
            { $ne: ['$invalidatedAt', null] },
            'invalidated',
            {
              $cond: [{ $lte: ['$expiresAt', now] }, 'expired', 'pending'],
            },
          ],
        },
      ],
    };

    // Plain predicates express the same precedence as the computed state, so
    // the leading match + top-level sort can use the application index instead
    // of materialising every invitation for a blocking sort inside $facet.
    const stateFilter: Record<string, unknown> =
      query.state === 'used'
        ? { usedAt: { $ne: null } }
        : query.state === 'invalidated'
          ? { usedAt: null, invalidatedAt: { $ne: null } }
          : query.state === 'expired'
            ? {
                usedAt: null,
                invalidatedAt: null,
                expiresAt: { $lte: now },
              }
            : query.state === 'pending'
              ? {
                  usedAt: null,
                  invalidatedAt: null,
                  expiresAt: { $gt: now },
                }
              : {};

    const [facet] = await this.linkModel.aggregate<{
      items: InvitationListItem[];
      total: Array<{ value: number }>;
    }>([
      {
        $match: {
          type: LinkType.INVITATION,
          applicationId: new Types.ObjectId(applicationId),
          ...stateFilter,
        },
      },
      { $sort: buildSortObject(query.sort) },
      {
        $facet: {
          items: [
            { $skip: (query.page - 1) * query.limit },
            { $limit: query.limit },
            { $addFields: { state: stateExpression } },
            {
              $project: {
                _id: 0,
                id: { $toString: '$_id' },
                email: 1,
                role: 1,
                state: 1,
                expiresAt: 1,
                usedAt: 1,
                invalidatedAt: 1,
                createdAt: 1,
              },
            },
          ],
          total: [{ $count: 'value' }],
        },
      },
    ]);

    return buildPaginatedResult(
      facet?.items ?? [],
      facet?.total[0]?.value ?? 0,
      query,
    );
  }

  /**
   * Counts unused invitation links. `pending` requires an unexpired and
   * non-invalidated link; `expired` counts every unused link past its expiry,
   * even if a later reissue invalidated it during the retention window.
   */
  async countInvitations(): Promise<InvitationCounts> {
    const now = new Date();
    const rows = await this.linkModel.aggregate<{
      _id: 'pending' | 'expired';
      count: number;
    }>([
      {
        $match: {
          type: LinkType.INVITATION,
          usedAt: null,
          $or: [
            { expiresAt: { $lte: now } },
            { invalidatedAt: null, expiresAt: { $gt: now } },
          ],
        },
      },
      {
        $group: {
          _id: {
            $cond: [{ $gt: ['$expiresAt', now] }, 'pending', 'expired'],
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const counts: InvitationCounts = { pending: 0, expired: 0 };
    for (const row of rows) {
      counts[row._id] = row.count;
    }

    return counts;
  }

  async revokeInvitation(
    applicationId: string,
    invitationId: string,
  ): Promise<boolean> {
    assertObjectId(applicationId, 'applicationId');
    assertObjectId(invitationId, 'invitationId');

    const filter = {
      _id: new Types.ObjectId(invitationId),
      applicationId: new Types.ObjectId(applicationId),
      type: LinkType.INVITATION,
    };

    // Bounded retry: an acceptance can set usedAt and then release() it back to
    // null after a failed password/grant step. Treating that transient state as
    // an already-invalidated no-op would tell the admin the invitation is
    // revoked while the token is still acceptable.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const link = await this.linkModel.findOne(filter);

      if (!link) {
        throw new EntityNotFoundError('Invitation not found');
      }
      if (link.usedAt !== null) {
        throw new ConflictError('Invitation already used');
      }
      if (link.invalidatedAt !== null) {
        return false;
      }

      const result = await this.linkModel.updateOne(
        { ...filter, usedAt: null, invalidatedAt: null },
        { $set: { invalidatedAt: new Date() } },
      );

      if (result.modifiedCount > 0) {
        return true;
      }
    }

    throw new ConflictError('Invitation could not be revoked; retry');
  }

  async createInvitation(
    input: CreateInvitationLinkInput,
  ): Promise<CreatedLink> {
    const email = normalizeEmail(input.email ?? '');

    if (!EMAIL_REGEX.test(email)) {
      throw new InvalidArgumentError('Invalid email format');
    }
    assertObjectId(input.applicationId, 'applicationId');
    if (!Object.values(GrantRoles).includes(input.role)) {
      throw new InvalidArgumentError('Invalid role');
    }
    const telegramChatId = normalizeTelegramChatId(input.telegramChatId);

    await this.invalidateActive({
      type: LinkType.INVITATION,
      email,
      applicationId: input.applicationId,
    });

    return this.createLink(
      {
        type: LinkType.INVITATION,
        email,
        applicationId: new Types.ObjectId(input.applicationId),
        role: input.role,
        ...(telegramChatId === undefined ? {} : { telegramChatId }),
      },
      input.expiresInMs ?? this.invitationExpirationMs,
    );
  }

  async createPasswordReset(
    input: CreatePasswordResetLinkInput,
  ): Promise<CreatedLink> {
    assertObjectId(input.userId, 'userId');

    await this.invalidateActive({
      type: LinkType.PASSWORD_RESET,
      userId: input.userId,
    });

    return this.createLink(
      {
        type: LinkType.PASSWORD_RESET,
        userId: new Types.ObjectId(input.userId),
      },
      this.passwordResetExpirationMs,
    );
  }

  async consume(token: string, type: LinkType): Promise<OneTimeLink> {
    if (!token) {
      throw new InvalidLinkError();
    }

    const link = await this.linkModel.findOneAndUpdate(
      {
        tokenHash: hashLinkToken(token),
        type,
        usedAt: null,
        invalidatedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $set: { usedAt: new Date() } },
      { returnDocument: 'after' },
    );

    if (!link) {
      throw new InvalidLinkError();
    }

    return link;
  }

  async invalidateActive(filter: InvalidateLinksFilter): Promise<void> {
    if (
      filter.email === undefined &&
      filter.applicationId === undefined &&
      filter.userId === undefined
    ) {
      throw new InvalidArgumentError(
        'At least one link discriminator is required',
      );
    }

    // Do not filter on usedAt: a link that is mid-accept must also be marked
    // invalidated so a later release() cannot revive it after a reissue.
    const query: Record<string, unknown> = {
      type: filter.type,
      invalidatedAt: null,
    };

    if (filter.email !== undefined) {
      query.email = filter.email;
    }
    if (filter.applicationId !== undefined) {
      assertObjectId(filter.applicationId, 'applicationId');
      query.applicationId = new Types.ObjectId(filter.applicationId);
    }
    if (filter.userId !== undefined) {
      assertObjectId(filter.userId, 'userId');
      query.userId = new Types.ObjectId(filter.userId);
    }

    await this.linkModel.updateMany(query, {
      $set: { invalidatedAt: new Date() },
    });
  }

  async release(id: string): Promise<void> {
    assertObjectId(id, 'linkId');

    await this.linkModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        usedAt: { $ne: null, $gt: new Date(Date.now() - RELEASE_WINDOW_MS) },
        invalidatedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $set: { usedAt: null } },
    );
  }

  private async createLink(
    data: Partial<OneTimeLink>,
    expirationMs: number,
  ): Promise<CreatedLink> {
    const token = generateLinkToken();
    const link = await this.linkModel.create({
      ...data,
      tokenHash: hashLinkToken(token),
      expiresAt: new Date(Date.now() + expirationMs),
      usedAt: null,
      invalidatedAt: null,
    });

    return { link, token };
  }
}
