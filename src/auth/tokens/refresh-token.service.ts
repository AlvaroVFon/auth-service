import { Model } from 'mongoose';
import { RefreshToken } from './refresh-token.interface';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../common/exceptions/base.exception';
import { OBJECTID_REGEX, JWT_REGEX } from '../../common/constants/regex';

export class RefreshTokenService {
  constructor(private refreshTokenModel: Model<RefreshToken>) {}

  async create(refreshTokenData: Partial<RefreshToken>): Promise<RefreshToken> {
    if (Object.keys(refreshTokenData).length === 0) {
      throw new InvalidArgumentError('refreshTokenData cannot be empty');
    }
    if (!refreshTokenData.userId) {
      throw new InvalidArgumentError('userId is required');
    }
    if (!refreshTokenData.token) {
      throw new InvalidArgumentError('token is required');
    }
    if (!refreshTokenData.expiresAt) {
      throw new InvalidArgumentError('expiresAt is required');
    }

    return this.refreshTokenModel.create(refreshTokenData);
  }

  async findActiveByUserId(userId: string): Promise<RefreshToken> {
    if (!userId) {
      throw new InvalidArgumentError('userId is required');
    }

    const now = new Date();
    const refreshToken = await this.refreshTokenModel.findOne({
      userId,
      expiresAt: { $gt: now },
      revokedAt: null,
    });

    if (!refreshToken) {
      throw new EntityNotFoundError(
        'No active refresh token found for the given userId',
      );
    }

    return refreshToken;
  }

  async revokeToken(tokenId: string, replacedByToken?: string): Promise<void> {
    if (OBJECTID_REGEX.test(tokenId) === false) {
      throw new InvalidArgumentError('tokenId is not a valid ObjectId');
    }
    if (
      replacedByToken !== undefined &&
      replacedByToken !== null &&
      JWT_REGEX.test(replacedByToken) === false
    ) {
      throw new InvalidArgumentError('Invalid replacedByToken format');
    }

    const refreshToken = await this.refreshTokenModel.findByIdAndUpdate(
      tokenId,
      {
        revokedAt: new Date(),
        replacedByToken: replacedByToken || null,
      },
      { new: true },
    );

    if (!refreshToken) {
      throw new EntityNotFoundError('Refresh token not found');
    }
  }
}
