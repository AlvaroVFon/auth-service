import { Model } from 'mongoose';
import { RefreshToken } from './refresh-token.interface';
import { RequestContext } from './request-context.type';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../common/exceptions/base.exception';
import { OBJECTID_REGEX, UUID_REGEX } from '../../common/constants/regex';

export class RefreshTokenService {
  constructor(private refreshTokenModel: Model<RefreshToken>) {}

  async create(
    userId: string,
    jti: string,
    expiresAt: Date,
    ctx?: RequestContext,
  ): Promise<RefreshToken> {
    if (!OBJECTID_REGEX.test(userId)) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }
    if (!UUID_REGEX.test(jti)) {
      throw new InvalidArgumentError('jti is not a valid UUID');
    }

    return this.refreshTokenModel.create({
      userId,
      jti,
      expiresAt,
      revokedAt: null,
      replacedByJti: null,
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
    });
  }

  async findByJti(jti: string): Promise<RefreshToken | null> {
    if (!UUID_REGEX.test(jti)) {
      throw new InvalidArgumentError('jti is not a valid UUID');
    }

    return this.refreshTokenModel.findOne({ jti });
  }

  async findAllActiveByUserId(userId: string): Promise<RefreshToken[]> {
    if (!OBJECTID_REGEX.test(userId)) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }

    const now = new Date();
    return this.refreshTokenModel.find({
      userId,
      expiresAt: { $gt: now },
      revokedAt: null,
    });
  }

  async revokeByJti(jti: string, replacedByJti?: string): Promise<void> {
    if (!UUID_REGEX.test(jti)) {
      throw new InvalidArgumentError('jti is not a valid UUID');
    }

    const result = await this.refreshTokenModel.updateOne(
      { jti },
      {
        revokedAt: new Date(),
        replacedByJti: replacedByJti || null,
      },
    );

    if (result.matchedCount === 0) {
      throw new EntityNotFoundError('Refresh token not found');
    }
  }

  async revokeAllByUserId(userId: string): Promise<void> {
    if (!OBJECTID_REGEX.test(userId)) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }

    await this.refreshTokenModel.updateMany(
      { userId, revokedAt: null },
      { revokedAt: new Date() },
    );
  }
}
