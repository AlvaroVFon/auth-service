import { Types } from 'mongoose';
import { RefreshTokenService } from '../../../../../src/auth/tokens/refresh-token.service';
import { RefreshTokenModel } from '../../../../../src/auth/tokens/refresh-token.schema';
import { RefreshToken } from '../../../../../src/auth/tokens/refresh-token.interface';
import fixture from '../../../../fixtures';
import { TokenTypes } from '../../../../../src/libs/jwt/token-types.enum';

describe('RefreshTokenService', () => {
  let refreshTokenService: RefreshTokenService;

  before(() => {
    refreshTokenService = new RefreshTokenService(RefreshTokenModel);
  });

  describe('create', () => {
    test('should throw an error when userId is invalid', async () => {
      await assert.rejects(
        () =>
          refreshTokenService.create(
            'invalid',
            '550e8400-e29b-41d4-a716-446655440000',
            new Date(),
          ),
        {
          name: 'InvalidArgumentError',
          message: 'userId is not a valid ObjectId',
        },
      );
    });

    test('should throw an error when jti is invalid', async () => {
      await assert.rejects(
        () =>
          refreshTokenService.create(
            new Types.ObjectId().toString(),
            'not-a-uuid',
            new Date(),
          ),
        {
          name: 'InvalidArgumentError',
          message: 'jti is not a valid UUID',
        },
      );
    });

    test('should create a refresh token successfully', async () => {
      const userId = new Types.ObjectId();
      const jti = '550e8400-e29b-41d4-a716-446655440001';
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

      const refreshToken = await refreshTokenService.create(
        userId.toString(),
        jti,
        expiresAt,
      );

      assert.strictEqual(refreshToken.userId.toString(), userId.toString());
      assert.strictEqual(refreshToken.jti, jti);
      assert.strictEqual(refreshToken.expiresAt.getTime(), expiresAt.getTime());
      assert.strictEqual(refreshToken.revokedAt, null);

      const dbToken = await fixture.findOne<RefreshToken>(
        RefreshTokenModel.modelName,
        { jti },
      );

      assert.strictEqual(dbToken?.jti, jti);
      assert.strictEqual(dbToken?.userId.toString(), userId.toString());
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
      const userId = new Types.ObjectId();
      const jti = '550e8400-e29b-41d4-a716-446655440002';
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

      await fixture.create<RefreshToken>(RefreshTokenModel.modelName, {
        userId,
        jti,
        expiresAt,
        revokedAt: null,
        replacedByJti: null,
        type: TokenTypes.REFRESH,
      });

      const found = await refreshTokenService.findByJti(jti);

      assert.ok(found);
      assert.strictEqual(found?.jti, jti);
      assert.strictEqual(found?.userId.toString(), userId.toString());
    });
  });

  describe('findAllActiveByUserId', () => {
    test('should throw an error when userId is invalid', async () => {
      await assert.rejects(
        () => refreshTokenService.findAllActiveByUserId('invalid'),
        {
          name: 'InvalidArgumentError',
          message: 'userId is not a valid ObjectId',
        },
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
      const userId = new Types.ObjectId();
      const futureDate = new Date(Date.now() + 1000 * 60 * 60);
      const pastDate = new Date(Date.now() - 1000 * 60 * 60);

      await fixture.createMany<RefreshToken>(RefreshTokenModel.modelName, [
        {
          userId,
          jti: '550e8400-e29b-41d4-a716-446655440003',
          expiresAt: futureDate,
          revokedAt: null,
          replacedByJti: null,
          type: TokenTypes.REFRESH,
        },
        {
          userId,
          jti: '550e8400-e29b-41d4-a716-446655440004',
          expiresAt: pastDate,
          revokedAt: null,
          replacedByJti: null,
          type: TokenTypes.REFRESH,
        },
        {
          userId,
          jti: '550e8400-e29b-41d4-a716-446655440005',
          expiresAt: futureDate,
          revokedAt: new Date(),
          replacedByJti: null,
          type: TokenTypes.REFRESH,
        },
      ]);

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
        {
          name: 'InvalidArgumentError',
          message: 'jti is not a valid UUID',
        },
      );
    });

    test('should throw an error when token is not found', async () => {
      await assert.rejects(
        () =>
          refreshTokenService.revokeByJti(
            '550e8400-e29b-41d4-a716-446655440099',
          ),
        {
          name: 'EntityNotFoundError',
          message: 'Refresh token not found',
        },
      );
    });

    test('should set revokedAt and replacedByJti when revoking', async () => {
      const userId = new Types.ObjectId();
      const jti = '550e8400-e29b-41d4-a716-446655440006';
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

      await fixture.create<RefreshToken>(RefreshTokenModel.modelName, {
        userId,
        jti,
        expiresAt,
        revokedAt: null,
        replacedByJti: null,
        type: TokenTypes.REFRESH,
      });

      const newJti = '550e8400-e29b-41d4-a716-446655440007';
      await refreshTokenService.revokeByJti(jti, newJti);

      const updated = await fixture.findOne<RefreshToken>(
        RefreshTokenModel.modelName,
        { jti },
      );

      assert.ok(updated?.revokedAt instanceof Date);
      assert.strictEqual(updated?.replacedByJti, newJti);
    });

    test('should set only revokedAt when revoking without replacement', async () => {
      const userId = new Types.ObjectId();
      const jti = '550e8400-e29b-41d4-a716-446655440008';
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

      await fixture.create<RefreshToken>(RefreshTokenModel.modelName, {
        userId,
        jti,
        expiresAt,
        revokedAt: null,
        replacedByJti: null,
        type: TokenTypes.REFRESH,
      });

      await refreshTokenService.revokeByJti(jti);

      const updated = await fixture.findOne<RefreshToken>(
        RefreshTokenModel.modelName,
        { jti },
      );

      assert.ok(updated?.revokedAt instanceof Date);
      assert.strictEqual(updated?.replacedByJti, null);
    });
  });

  describe('revokeAllByUserId', () => {
    test('should throw an error when userId is invalid', async () => {
      await assert.rejects(
        () => refreshTokenService.revokeAllByUserId('invalid'),
        {
          name: 'InvalidArgumentError',
          message: 'userId is not a valid ObjectId',
        },
      );
    });

    test('should revoke all active tokens for a user', async () => {
      const userId = new Types.ObjectId();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

      await fixture.createMany<RefreshToken>(RefreshTokenModel.modelName, [
        {
          userId,
          jti: '550e8400-e29b-41d4-a716-446655440010',
          expiresAt,
          revokedAt: null,
          replacedByJti: null,
          type: TokenTypes.REFRESH,
        },
        {
          userId,
          jti: '550e8400-e29b-41d4-a716-446655440011',
          expiresAt,
          revokedAt: null,
          replacedByJti: null,
          type: TokenTypes.REFRESH,
        },
      ]);

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
