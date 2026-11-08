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
   * Tokens observed before each update. A token issued between a listing and
   * its update is picked up (and listed) by the next pass while passes remain;
   * once the pass cap is reached, `complete` is false and the caller must
   * retry. `revoked` is the authoritative count.
   */
  sessions: RevokedAudienceSession[];
  revoked: number;
  /** False when the last pass still found active tokens; the caller can retry. */
  complete: boolean;
}

const MAX_REVOCATION_PASSES = 5;
const REVOCATION_BATCH_SIZE = 500;

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

  async revokeBySessionId(userId: string, sessionId: string): Promise<boolean> {
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
      return true;
    }

    // Revoking an already revoked session is a successful no-op; only an
    // unknown session is a 404.
    const exists = await this.refreshTokenModel.exists(sessionFilter);

    if (!exists) {
      throw new EntityNotFoundError('Session not found');
    }

    // It belonged to the user but was already revoked: a successful no-op.
    return false;
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

  /** Fast path for callers that do not need the revoked session ids. */
  async revokeAllBulk(userId: string, audience?: string): Promise<void> {
    if (!OBJECTID_REGEX.test(userId)) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }

    await this.refreshTokenModel.updateMany(
      {
        userId,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
        ...(audience === undefined ? {} : { audience }),
      },
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
    // running is revoked too. Each batch is bounded, so neither the listing nor
    // the `_id` update command can grow with the audience size.
    for (let pass = 0; pass < MAX_REVOCATION_PASSES; pass += 1) {
      const active = await this.refreshTokenModel
        .find(filter)
        .select('_id userId sessionId jti')
        .limit(REVOCATION_BATCH_SIZE)
        .lean<ActiveAudienceToken[]>();

      if (active.length === 0) {
        complete = true;
        break;
      }

      for (const token of active) {
        sessions.push({
          userId: token.userId.toString(),
          // Legacy tokens may predate `sessionId`; the jti identifies them.
          sessionId: token.sessionId ?? token.jti,
          jti: token.jti,
        });
      }

      const result = await this.refreshTokenModel.updateMany(
        {
          _id: { $in: active.map((token) => token._id) },
          revokedAt: null,
        },
        { revokedAt: new Date() },
      );
      revoked += result.modifiedCount ?? 0;

      // Keep looping until a pass finds nothing: a token created between this
      // listing and the update is caught by the next pass.
      complete = pass < MAX_REVOCATION_PASSES - 1;
    }

    if (!complete) {
      // A full last pass may have drained the remaining batch; confirm with a
      // cheap existence query instead of reporting a retry that would be a no-op.
      const remaining = await this.refreshTokenModel
        .find(filter)
        .select('_id')
        .limit(1)
        .lean<ActiveAudienceToken[]>();

      complete = remaining.length === 0;
    }

    return { sessions, revoked, complete };
  }

  /**
   * Revokes every active token of a user and returns the session identifiers it
   * listed, so the caller can audit exactly what this call revoked.
   */
  async revokeAllByUserId(
    userId: string,
    audience?: string,
  ): Promise<Array<{ sessionId: string; jti: string }>> {
    if (!OBJECTID_REGEX.test(userId)) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }

    const filter = {
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
      ...(audience === undefined ? {} : { audience }),
    };
    const revoked: Array<{ sessionId: string; jti: string }> = [];

    // Re-list until no active token remains (bounded), so a token issued while
    // the revocation runs is revoked and reported too. The timestamp marks the
    // tokens this call actually revoked, not ones a concurrent action closed.
    for (let pass = 0; pass < 3; pass += 1) {
      const active = await this.refreshTokenModel
        .find(filter)
        .select('_id')
        .lean<Array<{ _id: Types.ObjectId }>>();

      if (active.length === 0) {
        break;
      }

      const revokedAt = new Date();
      const ids = active.map((token) => token._id);

      await this.refreshTokenModel.updateMany(
        { _id: { $in: ids }, revokedAt: null },
        { revokedAt },
      );

      const revokedNow = await this.refreshTokenModel
        .find({ _id: { $in: ids }, revokedAt })
        .select('sessionId jti')
        .lean<Array<{ sessionId?: string; jti: string }>>();

      for (const token of revokedNow) {
        revoked.push({
          sessionId: token.sessionId ?? token.jti,
          jti: token.jti,
        });
      }
    }

    const remaining = await this.refreshTokenModel
      .find(filter)
      .select('_id')
      .limit(1)
      .lean<Array<{ _id: Types.ObjectId }>>();

    if (remaining.length > 0) {
      // Never report a complete revocation while a session can still refresh.
      throw new Error('Session revocation incomplete');
    }

    return revoked;
  }
}
