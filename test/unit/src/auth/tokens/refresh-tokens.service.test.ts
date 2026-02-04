import { Types } from 'mongoose';
import { RefreshTokenService } from '../../../../../src/auth/tokens/refresh-token.service';
import { RefreshTokenModel } from '../../../../../src/auth/tokens/refresh-token.schema';
import { RefreshToken } from '../../../../../src/auth/tokens/refresh-token.interface';
import fixture from '../../../../fixtures/fixture';

describe('RefreshTokenService', () => {
  let refreshTokenService: RefreshTokenService;

  before(() => {
    refreshTokenService = new RefreshTokenService(RefreshTokenModel);
  });

  describe('create', () => {
    test('should throw an error when refreshTokenData is empty', async () => {
      await assert.rejects(() => refreshTokenService.create({}), {
        name: 'InvalidArgumentError',
        message: 'refreshTokenData cannot be empty',
      });
    });

    test('should throw an error if userId is missing', async () => {
      const invalidData = { token: 'some-token', expiresAt: new Date() };
      await assert.rejects(() => refreshTokenService.create(invalidData), {
        name: 'InvalidArgumentError',
      });
    });

    test('should throw an error if token is missing', async () => {
      const invalidData = {
        userId: new Types.ObjectId(),
        expiresAt: new Date(),
      };
      await assert.rejects(() => refreshTokenService.create(invalidData), {
        name: 'InvalidArgumentError',
      });
    });

    test('should throw an error if expiresAt is missing', async () => {
      const invalidData = { userId: new Types.ObjectId(), token: 'some-token' };
      await assert.rejects(() => refreshTokenService.create(invalidData), {
        name: 'InvalidArgumentError',
      });
    });

    test('should create a refresh token successfully', async () => {
      const refreshTokenData = {
        userId: new Types.ObjectId(),
        token: 'some-token',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
      };

      const refreshToken = await refreshTokenService.create(refreshTokenData);

      assert.strictEqual(
        refreshToken.userId.toString(),
        refreshTokenData.userId.toString(),
      );
      assert.strictEqual(refreshToken.token, refreshTokenData.token);
      assert.strictEqual(
        refreshToken.expiresAt.getTime(),
        refreshTokenData.expiresAt.getTime(),
      );

      const dbRefreshToken = await fixture.findOne<RefreshToken>(
        RefreshTokenModel.modelName,
        { userId: refreshTokenData.userId.toString() },
      );

      assert.strictEqual(
        dbRefreshToken?.userId.toString(),
        refreshTokenData.userId.toString(),
      );
      assert.strictEqual(dbRefreshToken?.token, refreshTokenData.token);
      assert.strictEqual(
        dbRefreshToken?.expiresAt.getTime(),
        refreshTokenData.expiresAt.getTime(),
      );
    });
  });

  describe('findActiveByUserId', () => {
    test('should throw an error if userId is missing', async () => {
      await assert.rejects(() => refreshTokenService.findActiveByUserId(''), {
        name: 'InvalidArgumentError',
        message: 'userId is required',
      });
    });

    test('should throw an error if no active token is found', async () => {
      await assert.rejects(
        () =>
          refreshTokenService.findActiveByUserId(
            new Types.ObjectId().toString(),
          ),
        {
          name: 'EntityNotFoundError',
          message: 'No active refresh token found for the given userId',
        },
      );
    });

    test('should find active refresh token by userId', async () => {
      const userId = new Types.ObjectId();
      const refreshTokenData = {
        userId,
        token: 'active-token',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
      };

      await fixture.create<RefreshToken>(
        RefreshTokenModel.modelName,
        refreshTokenData,
      );

      const activeToken = await refreshTokenService.findActiveByUserId(
        userId.toString(),
      );

      assert.strictEqual(activeToken.userId.toString(), userId.toString());
      assert.strictEqual(activeToken.token, refreshTokenData.token);
      assert.strictEqual(
        activeToken.expiresAt.getTime(),
        refreshTokenData.expiresAt.getTime(),
      );
    });
  });

  describe('revokeToken', () => {
    test('should throw an error if tokenId is missing', async () => {
      await assert.rejects(() => refreshTokenService.revokeToken(null as any), {
        name: 'InvalidArgumentError',
        message: 'tokenId is not a valid ObjectId',
      });
    });

    test('should throw an error if tokenId is empty', async () => {
      await assert.rejects(() => refreshTokenService.revokeToken(''), {
        name: 'InvalidArgumentError',
        message: 'tokenId is not a valid ObjectId',
      });
    });

    test('should throw an error if replacedByToken is provided but empty', async () => {
      await assert.rejects(
        () => refreshTokenService.revokeToken('000000000000000000000000', ''),
        {
          name: 'InvalidArgumentError',
          message: 'Invalid replacedByToken format',
        },
      );
    });

    test('should throw an error if replacedByToken is provided but only whitespace', async () => {
      await assert.rejects(
        () =>
          refreshTokenService.revokeToken('000000000000000000000000', '   '),
        {
          name: 'InvalidArgumentError',
          message: 'Invalid replacedByToken format',
        },
      );
    });

    test('should throw an error if replacedByToken but has invalid format', async () => {
      await assert.rejects(
        () =>
          refreshTokenService.revokeToken(
            '000000000000000000000000',
            'invalid-format',
          ),
        {
          name: 'InvalidArgumentError',
          message: 'Invalid replacedByToken format',
        },
      );
    });

    test('should pass validation with valid tokenId and replacedByToken', async () => {
      const refreshToken = await fixture.create<RefreshToken>(
        RefreshTokenModel.modelName,
        {
          userId: new Types.ObjectId(),
          token: 'some.valid.token',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
        },
      );

      await assert.doesNotReject(async () => {
        await refreshTokenService.revokeToken(
          refreshToken._id.toString(),
          'some.valid.replacement.token',
        );
      });
    });

    test('should set revokedAt and replacedByToken when revoking a token', async () => {
      const refreshTokenData = {
        userId: new Types.ObjectId(),
        token: 'some.valid.token',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
      };

      const refreshToken = await fixture.create<RefreshToken>(
        RefreshTokenModel.modelName,
        refreshTokenData,
      );

      await refreshTokenService.revokeToken(
        refreshToken._id.toString(),
        'new.valid.token',
      );

      const updatedToken = await fixture.findOne<RefreshToken>(
        RefreshTokenModel.modelName,
        { _id: refreshToken._id },
      );

      assert.ok(updatedToken?.revokedAt instanceof Date);
      assert.strictEqual(updatedToken?.replacedByToken, 'new.valid.token');
    });

    test('should set only revokedAt when revoking a token without replacedByToken', async () => {
      const refreshTokenData = {
        userId: new Types.ObjectId(),
        token: 'another.valid.token',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
      };

      const refreshToken = await fixture.create<RefreshToken>(
        RefreshTokenModel.modelName,
        refreshTokenData,
      );

      await refreshTokenService.revokeToken(refreshToken._id.toString());

      const updatedToken = await fixture.findOne<RefreshToken>(
        RefreshTokenModel.modelName,
        { _id: refreshToken._id },
      );

      assert.ok(updatedToken?.revokedAt instanceof Date);
      assert.strictEqual(updatedToken?.replacedByToken, null);
    });
  });
});
