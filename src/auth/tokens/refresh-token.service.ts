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

    const result = await this.refreshTokenModel.updateMany(
      { userId, sessionId, revokedAt: null },
      { revokedAt: new Date() },
    );

    if (result.matchedCount === 0) {
      throw new EntityNotFoundError('Session not found');
    }
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
