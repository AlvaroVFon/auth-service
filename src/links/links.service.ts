import { Model, Types } from 'mongoose';

import { EMAIL_REGEX } from '../common/constants/regex';
import { normalizeEmail } from '../common/email';
import {
  ConflictError,
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { InvalidLinkError } from '../common/exceptions/links.exceptions';
import { normalizeTelegramChatId } from '../common/telegram-chat-id';
import { assertObjectId } from '../common/validators/object-id';
import { GrantRoles } from '../grants';
import { generateLinkToken, hashLinkToken } from './link-token';
import { LinkType, OneTimeLink } from './link.interface';
import {
  CreateInvitationLinkInput,
  CreatePasswordResetLinkInput,
  CreatedLink,
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
