import { Model, Types } from 'mongoose';

import { OBJECTID_REGEX, UUID_REGEX } from '../../common/constants/regex';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../common/exceptions/base.exception';
import { RefreshToken } from './refresh-token.interface';
import { RequestContext } from './request-context.type';

export interface SessionOptions {
  sessionId?: string;
  sessionStartedAt?: Date;
  audience?: string;
}

/** Session revoked by a bulk audience operation, returned for auditing. */
export interface RevokedAudienceSession {
  userId: string;
  sessionId: string;
  jti: string;
}

export interface RevokeAllByAudienceResult {
  /**
   * Tokens observed before each update. A token created between the listing and
   * the update is revoked but not listed; `revoked` is the authoritative count.
   */
  sessions: RevokedAudienceSession[];
  revoked: number;
  /** False when the last pass still found active tokens; the caller can retry. */
  complete: boolean;
}

const MAX_REVOCATION_PASSES = 5;

interface ActiveAudienceToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  sessionId: string;
  jti: string;
}

export class RefreshTokenService {
  constructor(private refreshTokenModel: Model<RefreshToken>) {}

  async create(
    userId: string,
    jti: string,
    expiresAt: Date,
    ctx?: RequestContext,
    options: SessionOptions = {},
  ): Promise<RefreshToken> {
    if (!OBJECTID_REGEX.test(userId)) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }
    if (!UUID_REGEX.test(jti)) {
      throw new InvalidArgumentError('jti is not a valid UUID');
    }
    if (options.sessionId && !UUID_REGEX.test(options.sessionId)) {
      throw new InvalidArgumentError('sessionId is not a valid UUID');
    }

    return this.refreshTokenModel.create({
      userId,
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      jti,
      sessionStartedAt: options.sessionStartedAt ?? new Date(),
      expiresAt,
      lastActivityAt: new Date(),
      revokedAt: null,
      replacedByJti: null,
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      audience: options.audience ?? null,
    });
  }

  async findByJti(jti: string): Promise<RefreshToken | null> {
    if (!UUID_REGEX.test(jti)) {
      throw new InvalidArgumentError('jti is not a valid UUID');
    }

    return this.refreshTokenModel.findOne({ jti });
  }

  async listActiveByUserId(userId: string): Promise<RefreshToken[]> {
    if (!OBJECTID_REGEX.test(userId)) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }

    return this.refreshTokenModel
      .find({
        userId,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .sort({ lastActivityAt: -1 });
  }

  async revokeByJti(jti: string, replacedByJti?: string): Promise<void> {
    if (!UUID_REGEX.test(jti)) {
      throw new InvalidArgumentError('jti is not a valid UUID');
    }

    const result = await this.refreshTokenModel.updateOne(
      { jti, revokedAt: null },
      {
        revokedAt: new Date(),
        replacedByJti: replacedByJti || null,
      },
    );

    if (result.matchedCount === 0) {
      throw new EntityNotFoundError('Refresh token not found');
    }
  }

  async revokeBySessionId(userId: string, sessionId: string): Promise<void> {
    if (!OBJECTID_REGEX.test(userId)) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }
    if (!UUID_REGEX.test(sessionId)) {
      throw new InvalidArgumentError('sessionId is not a valid UUID');
    }

    // Tokens created before sessionId existed are listed with their jti as the
    // session id, so the revoke path must keep that fallback.
    const sessionFilter = {
      userId,
      $or: [{ sessionId }, { jti: sessionId, sessionId: null }],
    };

    const result = await this.refreshTokenModel.updateMany(
      { ...sessionFilter, revokedAt: null },
      { revokedAt: new Date() },
    );

    if (result.matchedCount > 0) {
      return;
    }

    // Revoking an already revoked session is a successful no-op; only an
    // unknown session is a 404.
    const exists = await this.refreshTokenModel.exists(sessionFilter);

    if (!exists) {
      throw new EntityNotFoundError('Session not found');
    }
  }

  async pruneActiveSessions(userId: string, keep: number): Promise<void> {
    if (!OBJECTID_REGEX.test(userId)) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }

    if (keep < 0) {
      throw new InvalidArgumentError('keep must not be negative');
    }

    const stale = await this.refreshTokenModel
      .find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ lastActivityAt: -1 })
      .skip(keep)
      .select('_id')
      .lean();

    if (stale.length === 0) {
      return;
    }

    await this.refreshTokenModel.updateMany(
      { _id: { $in: stale.map((token) => token._id) } },
      { revokedAt: new Date() },
    );
  }

  /**
   * Revokes every active refresh token of an audience, listing them first so the
   * caller can audit session by session and exclude users (the owner) upstream.
   * Tokens without an audience are left untouched.
   */
  async revokeAllByAudience(
    audience: string,
    excludedUserIds: string[] = [],
  ): Promise<RevokeAllByAudienceResult> {
    const normalizedAudience = audience?.trim();

    if (!normalizedAudience) {
      throw new InvalidArgumentError('audience is required');
    }

    for (const userId of excludedUserIds) {
      if (!OBJECTID_REGEX.test(userId)) {
        throw new InvalidArgumentError(
          'excluded userId is not a valid ObjectId',
        );
      }
    }

    const filter = {
      audience: normalizedAudience,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
      ...(excludedUserIds.length === 0
        ? {}
        : { userId: { $nin: excludedUserIds } }),
    };

    const sessions: RevokedAudienceSession[] = [];
    let revoked = 0;
    let complete = true;

    // Re-evaluate the filter on every pass so a token issued while the call is
    // running is revoked too. The `_id` list is never sent to the server: the
    // update uses the audience filter directly, so its size is unbounded only
    // in the documents Mongo touches, not in the command payload.
    for (let pass = 0; pass < MAX_REVOCATION_PASSES; pass += 1) {
      const active = await this.refreshTokenModel
        .find(filter)
        .select('_id userId sessionId jti')
        .lean<ActiveAudienceToken[]>();

      for (const token of active) {
        sessions.push({
          userId: token.userId.toString(),
          sessionId: token.sessionId,
          jti: token.jti,
        });
      }

      const result = await this.refreshTokenModel.updateMany(filter, {
        revokedAt: new Date(),
      });
      revoked += result.modifiedCount ?? 0;

      if (active.length === 0) {
        complete = true;
        break;
      }

      // The loop is bounded; if the last pass still found tokens the caller
      // must know the revocation may not be exhaustive.
      complete = pass < MAX_REVOCATION_PASSES - 1;
    }

    return { sessions, revoked, complete };
  }

  async revokeAllByUserId(userId: string, audience?: string): Promise<void> {
    if (!OBJECTID_REGEX.test(userId)) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }

    await this.refreshTokenModel.updateMany(
      {
        userId,
        revokedAt: null,
        ...(audience === undefined ? {} : { audience }),
      },
      { revokedAt: new Date() },
    );
  }
}
