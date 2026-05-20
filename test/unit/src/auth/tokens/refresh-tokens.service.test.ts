import { Types } from 'mongoose';
import { RefreshTokenService } from '../../../../../src/auth/tokens/refresh-token.service';
import { RefreshTokenModel } from '../../../../../src/auth/tokens/refresh-token.schema';
import { RefreshToken } from '../../../../../src/auth/tokens/refresh-token.interface';
import fixture from '../../../../fixtures';
import { TokenTypes } from '../../../../../src/libs/jwt/token-types.enum';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../../../../src/common/exceptions/base.exception';
import { RefreshTokenFactory } from '../../../../helpers/factories/refresh-token.factory';
import { MotherFactory } from '../../../../helpers/factories/mother.factory';

describe('RefreshTokenService', () => {
  let refreshTokenService: RefreshTokenService;

  before(() => {
    refreshTokenService = new RefreshTokenService(RefreshTokenModel);
  });

  describe('create', () => {
    test('should throw an error when userId is invalid', async () => {
      const refreshTokenData = RefreshTokenFactory.generate({
        userId: 'invalid' as unknown as Types.ObjectId,
      });

      await assert.rejects(
        refreshTokenService.create(
          refreshTokenData.userId.toString(),
          refreshTokenData.jti,
          refreshTokenData.expiresAt,
        ),
        new InvalidArgumentError('userId is not a valid ObjectId'),
      );
    });

    test('should throw an error when jti is invalid', async () => {
      const refreshTokenData = RefreshTokenFactory.generate({
        jti: 'not-a-uuid',
      });

      await assert.rejects(
        refreshTokenService.create(
          String(refreshTokenData.userId),
          refreshTokenData.jti,
          refreshTokenData.expiresAt,
        ),
        new InvalidArgumentError('jti is not a valid UUID'),
      );
    });

    test('should create a refresh token successfully', async () => {
      const refreshTokenData = RefreshTokenFactory.generate();

      const refreshToken = await refreshTokenService.create(
        String(refreshTokenData.userId),
        refreshTokenData.jti,
        refreshTokenData.expiresAt,
      );

      assert.strictEqual(
        refreshToken.userId.toString(),
        String(refreshTokenData.userId),
      );
      assert.strictEqual(refreshToken.jti, refreshTokenData.jti);
      assert.strictEqual(
        refreshToken.expiresAt.getTime(),
        refreshTokenData.expiresAt.getTime(),
      );
      assert.strictEqual(refreshToken.revokedAt, null);

      const dbToken = await fixture.findOne<RefreshToken>(
        RefreshTokenModel.modelName,
        { jti: refreshTokenData.jti },
      );

      assert.strictEqual(dbToken?.jti, refreshTokenData.jti);
      assert.strictEqual(
        dbToken?.userId.toString(),
        String(refreshTokenData.userId),
      );
    });
  });

  describe('findByJti', () => {
    test('should throw an error when jti is invalid', async () => {
      await assert.rejects(() => refreshTokenService.findByJti('not-a-uuid'), {
        name: 'InvalidArgumentError',
        message: 'jti is not a valid UUID',
      });
    });

    test('should return null when token is not found', async () => {
      const result = await refreshTokenService.findByJti(
        '550e8400-e29b-41d4-a716-446655440099',
      );
      assert.strictEqual(result, null);
    });

    test('should find token by jti', async () => {
      const refreshTokenData = RefreshTokenFactory.generate();

      await fixture.create<RefreshToken>(RefreshTokenModel.modelName, {
        userId: refreshTokenData.userId,
        jti: refreshTokenData.jti,
        expiresAt: refreshTokenData.expiresAt,
        revokedAt: null,
        replacedByJti: null,
        type: TokenTypes.REFRESH,
      });

      const found = await refreshTokenService.findByJti(refreshTokenData.jti);

      assert.ok(found);
      assert.strictEqual(found?.jti, refreshTokenData.jti);
      assert.strictEqual(
        found?.userId.toString(),
        String(refreshTokenData.userId),
      );
    });
  });

  describe('findAllActiveByUserId', () => {
    test('should throw an error when userId is invalid', async () => {
      await assert.rejects(
        () => refreshTokenService.findAllActiveByUserId('invalid'),
        new InvalidArgumentError('userId is not a valid ObjectId'),
      );
    });

    test('should return empty array when no active tokens exist', async () => {
      const userId = new Types.ObjectId();
      const tokens = await refreshTokenService.findAllActiveByUserId(
        userId.toString(),
      );
      assert.deepStrictEqual(tokens, []);
    });

    test('should return only active tokens', async () => {
      const userId = MotherFactory.objectId();

      const tokensData = [
        RefreshTokenFactory.generate({
          userId,
          jti: '550e8400-e29b-41d4-a716-446655440003',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        }),
        RefreshTokenFactory.generate({
          userId,
          jti: '550e8400-e29b-41d4-a716-446655440004',
          expiresAt: new Date(Date.now() - 1000 * 60 * 60),
        }),
        RefreshTokenFactory.generate({
          userId,
          jti: '550e8400-e29b-41d4-a716-446655440005',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          revokedAt: new Date(),
        }),
      ];

      await fixture.createMany<RefreshToken>(
        RefreshTokenModel.modelName,
        tokensData,
      );

      const tokens = await refreshTokenService.findAllActiveByUserId(
        userId.toString(),
      );

      assert.strictEqual(tokens.length, 1);
      assert.strictEqual(
        tokens[0]?.jti,
        '550e8400-e29b-41d4-a716-446655440003',
      );
    });
  });

  describe('revokeByJti', () => {
    test('should throw an error when jti is invalid', async () => {
      await assert.rejects(
        () => refreshTokenService.revokeByJti('not-a-uuid'),
        new InvalidArgumentError('jti is not a valid UUID'),
      );
    });

    test('should throw an error when token is not found', async () => {
      await assert.rejects(
        () =>
          refreshTokenService.revokeByJti(
            '550e8400-e29b-41d4-a716-446655440099',
          ),
        new EntityNotFoundError('Refresh token not found'),
      );
    });

    test('should set revokedAt and replacedByJti when revoking', async () => {
      const refreshTokenData = RefreshTokenFactory.generate();

      await fixture.create<RefreshToken>(RefreshTokenModel.modelName, {
        userId: refreshTokenData.userId,
        jti: refreshTokenData.jti,
        expiresAt: refreshTokenData.expiresAt,
        revokedAt: null,
        replacedByJti: null,
        type: TokenTypes.REFRESH,
      });

      const newJti = '550e8400-e29b-41d4-a716-446655440007';
      await refreshTokenService.revokeByJti(refreshTokenData.jti, newJti);

      const updated = await fixture.findOne<RefreshToken>(
        RefreshTokenModel.modelName,
        { jti: refreshTokenData.jti },
      );

      assert.ok(updated?.revokedAt instanceof Date);
      assert.strictEqual(updated?.replacedByJti, newJti);
    });

    test('should set only revokedAt when revoking without replacement', async () => {
      const refreshTokenData = RefreshTokenFactory.generate();

      await fixture.create<RefreshToken>(RefreshTokenModel.modelName, {
        userId: refreshTokenData.userId,
        jti: refreshTokenData.jti,
        expiresAt: refreshTokenData.expiresAt,
        revokedAt: null,
        replacedByJti: null,
        type: TokenTypes.REFRESH,
      });

      await refreshTokenService.revokeByJti(refreshTokenData.jti);

      const updated = await fixture.findOne<RefreshToken>(
        RefreshTokenModel.modelName,
        { jti: refreshTokenData.jti },
      );

      assert.ok(updated?.revokedAt instanceof Date);
      assert.strictEqual(updated?.replacedByJti, null);
    });
  });

  describe('revokeAllByUserId', () => {
    test('should throw an error when userId is invalid', async () => {
      await assert.rejects(
        () => refreshTokenService.revokeAllByUserId('invalid'),
        new InvalidArgumentError('userId is not a valid ObjectId'),
      );
    });

    test('should revoke all active tokens for a user', async () => {
      const userId = new Types.ObjectId();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

      const tokensData = [
        RefreshTokenFactory.generate({
          userId,
          jti: '550e8400-e29b-41d4-a716-446655440008',
          expiresAt,
        }),
        RefreshTokenFactory.generate({
          userId,
          jti: '550e8400-e29b-41d4-a716-446655440009',
          expiresAt,
        }),
      ];

      await fixture.createMany<RefreshToken>(
        RefreshTokenModel.modelName,
        tokensData,
      );
      await refreshTokenService.revokeAllByUserId(userId.toString());

      const activeTokens = await refreshTokenService.findAllActiveByUserId(
        userId.toString(),
      );
      assert.strictEqual(activeTokens.length, 0);

      const allTokens = await fixture.find<RefreshToken>(
        RefreshTokenModel.modelName,
        { userId },
      );
      assert.strictEqual(allTokens.length, 2);
      assert.ok(allTokens[0]?.revokedAt instanceof Date);
      assert.ok(allTokens[1]?.revokedAt instanceof Date);
    });
  });
});
