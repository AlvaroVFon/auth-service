import { randomUUID } from 'node:crypto';

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
   * Exactly the tokens this call transitioned from active to revoked, tagged
   * with the unique per-pass `revocationBatchId`. A concurrent revocation is
   * never reported here. Once the pass cap is reached, `complete` is false and
   * the caller must retry.
   */
  sessions: RevokedAudienceSession[];
  revoked: number;
  /** False when the last pass still found active tokens; the caller can retry. */
  complete: boolean;
}

export interface RevokeAllByUserResult {
  /** Identifiers of the sessions this call actually revoked, for auditing. */
  sessions: Array<{ sessionId: string; jti: string }>;
  /** False when active tokens remain after the bounded passes. */
  complete: boolean;
}

const MAX_REVOCATION_PASSES = 5;
const REVOCATION_BATCH_SIZE = 500;

interface RevocableToken {
  _id: Types.ObjectId;
  userId?: Types.ObjectId;
  sessionId?: string;
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
    const now = new Date();
    const sessionFilter = {
      userId,
      expiresAt: { $gt: now },
      $or: [{ sessionId }, { jti: sessionId, sessionId: null }],
    };

    // Bounded re-list: a concurrent rotation revokes the old token and inserts
    // its replacement with the same session id, so a single update can miss
    // the replacement and report a no-op while the session stays alive.
    const revoked = await this.revokeInBatches<RevocableToken>(
      { ...sessionFilter, revokedAt: null },
      'sessionId jti',
      (token) => token,
    );

    if (revoked.items.length > 0) {
      if (!revoked.complete) {
        throw new Error('Session revocation incomplete');
      }
      return true;
    }

    // Revoking an already revoked session is a successful no-op; only an
    // unknown or expired session is a 404. Expired tokens are never listed as
    // active, so they must not produce a success audit event either.
    const exists = await this.refreshTokenModel.exists(sessionFilter);

    if (!exists) {
      throw new EntityNotFoundError('Session not found');
    }

    // It belonged to the user but was already revoked: a successful no-op.
    return false;
  }

  async pruneActiveSessions(
    userId: string,
    keep: number,
    audience?: string | null,
  ): Promise<void> {
    if (!OBJECTID_REGEX.test(userId)) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }

    if (keep < 0) {
      throw new InvalidArgumentError('keep must not be negative');
    }

    const stale = await this.refreshTokenModel
      .find({
        userId,
        ...(audience === undefined ? {} : { audience }),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
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

    const result = await this.revokeInBatches<RevokedAudienceSession>(
      filter,
      'userId sessionId jti',
      (token) => ({
        userId: token.userId?.toString() ?? '',
        // Legacy tokens may predate `sessionId`; the jti identifies them.
        sessionId: token.sessionId ?? token.jti,
        jti: token.jti,
      }),
    );

    return {
      sessions: result.items,
      revoked: result.items.length,
      complete: result.complete,
    };
  }

  /**
   * Revokes every active token of a user and returns the session identifiers it
   * actually revoked, plus whether the bounded passes drained every token. The
   * caller audits the returned sessions even when `complete` is false.
   */
  async revokeAllByUserId(
    userId: string,
    audience?: string,
  ): Promise<RevokeAllByUserResult> {
    if (!OBJECTID_REGEX.test(userId)) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }

    const filter = {
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
      ...(audience === undefined ? {} : { audience }),
    };
    const result = await this.revokeInBatches<{
      sessionId: string;
      jti: string;
    }>(filter, 'sessionId jti', (token) => ({
      sessionId: token.sessionId ?? token.jti,
      jti: token.jti,
    }));

    // Return what was revoked even when a token survived the bounded passes:
    // the caller can audit every real revocation and still surface that the
    // bulk operation was incomplete.
    return { sessions: result.items, complete: result.complete };
  }

  /**
   * Shared bounded revocation loop: re-list the filter on every pass, update
   * exactly the listed ids and report the tokens the write matched. A token
   * created between a listing and its update is caught by the next pass.
   */
  private async revokeInBatches<T>(
    filter: Record<string, unknown>,
    select: string,
    map: (token: RevocableToken) => T,
  ): Promise<{ items: T[]; complete: boolean }> {
    const items: T[] = [];
    let complete = false;

    for (let pass = 0; pass < MAX_REVOCATION_PASSES; pass += 1) {
      const active = await this.refreshTokenModel
        .find(filter)
        .select(select)
        .limit(REVOCATION_BATCH_SIZE)
        .lean<RevocableToken[]>();

      if (active.length === 0) {
        complete = true;
        break;
      }

      // A unique batch marker makes the reported set exactly the tokens this
      // call transitioned, with two bounded commands per pass instead of one
      // write per token.
      const batchId = randomUUID();
      await this.refreshTokenModel.updateMany(
        { _id: { $in: active.map((token) => token._id) }, revokedAt: null },
        { $set: { revokedAt: new Date(), revocationBatchId: batchId } },
      );

      const revokedNow = await this.refreshTokenModel
        .find({ revocationBatchId: batchId })
        .select(select)
        .lean<RevocableToken[]>();

      for (const token of revokedNow) {
        items.push(map(token));
      }
    }

    if (!complete) {
      // A full last pass may have drained the remaining batch; confirm instead
      // of reporting a retry that would be a no-op.
      const remaining = await this.refreshTokenModel
        .find(filter)
        .select('_id')
        .limit(1)
        .lean<RevocableToken[]>();

      complete = remaining.length === 0;
    }

    return { items, complete };
  }
}
