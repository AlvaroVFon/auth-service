import { Model, Types } from 'mongoose';

import { EMAIL_REGEX } from '../common/constants/regex';
import { normalizeEmail } from '../common/email';
import { InvalidArgumentError } from '../common/exceptions/base.exception';
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

    const [facet] = await this.linkModel.aggregate<{
      items: InvitationListItem[];
      total: Array<{ value: number }>;
    }>([
      {
        $match: {
          type: LinkType.INVITATION,
          applicationId: new Types.ObjectId(applicationId),
        },
      },
      { $addFields: { state: stateExpression } },
      ...(query.state === undefined
        ? []
        : [{ $match: { state: query.state } }]),
      {
        $facet: {
          items: [
            { $sort: buildSortObject(query.sort) },
            { $skip: (query.page - 1) * query.limit },
            { $limit: query.limit },
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
      this.invitationExpirationMs,
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
