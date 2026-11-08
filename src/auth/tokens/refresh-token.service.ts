import { Model } from 'mongoose';

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
      ...(audience === undefined ? {} : { audience }),
    };
    const revoked: Array<{ sessionId: string; jti: string }> = [];

    // Re-list until no active token remains (bounded), so a token issued while
    // the revocation runs is revoked and reported too.
    for (let pass = 0; pass < 3; pass += 1) {
      const active = await this.refreshTokenModel
        .find(filter)
        .select('sessionId jti')
        .lean<Array<{ sessionId?: string; jti: string }>>();

      if (active.length === 0) {
        break;
      }

      for (const token of active) {
        revoked.push({
          sessionId: token.sessionId ?? token.jti,
          jti: token.jti,
        });
      }

      await this.refreshTokenModel.updateMany(filter, {
        revokedAt: new Date(),
      });
    }

    return revoked;
  }
}
