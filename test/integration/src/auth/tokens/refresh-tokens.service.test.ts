import { Types } from 'mongoose';

import { RefreshToken } from '../../../../../src/auth/tokens/refresh-token.interface';
import { RefreshTokenModel } from '../../../../../src/auth/tokens/refresh-token.schema';
import { RefreshTokenService } from '../../../../../src/auth/tokens/refresh-token.service';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../../../../src/common/exceptions/base.exception';
import { TokenTypes } from '../../../../../src/libs/jwt/token-types.enum';
import fixture from '../../../../fixtures';
import { assertTtlIndex } from '../../../../helpers/assert-ttl-index';
import { RefreshTokenFactory } from '../../../../helpers/factories/refresh-token.factory';

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

    test('should persist ipAddress and userAgent when ctx is provided', async () => {
      const refreshTokenData = RefreshTokenFactory.generate();
      const ctx = {
        ipAddress: '203.0.113.1',
        userAgent: 'Mozilla/5.0',
      };

      const refreshToken = await refreshTokenService.create(
        String(refreshTokenData.userId),
        refreshTokenData.jti,
        refreshTokenData.expiresAt,
        ctx,
      );

      assert.strictEqual(refreshToken.ipAddress, '203.0.113.1');
      assert.strictEqual(refreshToken.userAgent, 'Mozilla/5.0');

      const dbToken = await fixture.findOne<RefreshToken>(
        RefreshTokenModel.modelName,
        { jti: refreshTokenData.jti },
      );

      assert.strictEqual(dbToken?.ipAddress, '203.0.113.1');
      assert.strictEqual(dbToken?.userAgent, 'Mozilla/5.0');
    });

    test('should set ipAddress and userAgent to null when ctx is omitted', async () => {
      const refreshTokenData = RefreshTokenFactory.generate();

      const refreshToken = await refreshTokenService.create(
        String(refreshTokenData.userId),
        refreshTokenData.jti,
        refreshTokenData.expiresAt,
      );

      assert.strictEqual(refreshToken.ipAddress, null);
      assert.strictEqual(refreshToken.userAgent, null);

      const dbToken = await fixture.findOne<RefreshToken>(
        RefreshTokenModel.modelName,
        { jti: refreshTokenData.jti },
      );

      assert.strictEqual(dbToken?.ipAddress, null);
      assert.strictEqual(dbToken?.userAgent, null);
    });

    test('should throw an error when userId is invalid even with ctx', async () => {
      const ctx = {
        ipAddress: '198.51.100.1',
        userAgent: 'curl/7.0',
      };

      await assert.rejects(
        refreshTokenService.create(
          'invalid',
          '550e8400-e29b-41d4-a716-446655440099',
          new Date(),
          ctx,
        ),
        new InvalidArgumentError('userId is not a valid ObjectId'),
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

      const activeTokens = await fixture.find<RefreshToken>(
        RefreshTokenModel.modelName,
        { userId, revokedAt: null },
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

  describe('sessions', () => {
    const sessionA = '6f1c2a2e-1111-4111-a111-111111111111';
    const sessionB = '6f1c2a2e-2222-4222-a222-222222222222';

    test('should persist the session id and audience', async () => {
      const userId = new Types.ObjectId();
      const jti = '550e8400-e29b-41d4-a716-446655440011';

      const token = await refreshTokenService.create(
        userId.toString(),
        jti,
        new Date(Date.now() + 60_000),
        undefined,
        { sessionId: sessionA, audience: 'app-aud' },
      );

      assert.strictEqual(token.sessionId, sessionA);
      assert.strictEqual(token.audience, 'app-aud');
      assert.ok(token.lastActivityAt instanceof Date);
    });

    test('should default a session id when none is provided', async () => {
      const userId = new Types.ObjectId();
      const token = await refreshTokenService.create(
        userId.toString(),
        '550e8400-e29b-41d4-a716-446655440012',
        new Date(Date.now() + 60_000),
      );

      assert.match(token.sessionId ?? '', /^[0-9a-f-]{36}$/);
    });

    test('should reject an invalid session id', async () => {
      await assert.rejects(
        refreshTokenService.create(
          new Types.ObjectId().toString(),
          '550e8400-e29b-41d4-a716-446655440013',
          new Date(Date.now() + 60_000),
          undefined,
          { sessionId: 'not-a-uuid' },
        ),
        new InvalidArgumentError('sessionId is not a valid UUID'),
      );
    });

    test('should list only active and non-expired sessions', async () => {
      const userId = new Types.ObjectId();
      await fixture.createMany<RefreshToken>(RefreshTokenModel.modelName, [
        RefreshTokenFactory.generate({
          userId,
          sessionId: sessionA,
          audience: 'app-a',
          userAgent: 'Desktop',
          expiresAt: new Date(Date.now() + 60_000),
        }),
        RefreshTokenFactory.generate({
          userId,
          sessionId: sessionB,
          audience: 'app-b',
          userAgent: 'Mobile',
          expiresAt: new Date(Date.now() + 60_000),
        }),
        RefreshTokenFactory.generate({
          userId,
          sessionId: '6f1c2a2e-3333-4333-a333-333333333333',
          revokedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        }),
        RefreshTokenFactory.generate({
          userId,
          sessionId: '6f1c2a2e-4444-4444-a444-444444444444',
          expiresAt: new Date(Date.now() - 60_000),
        }),
      ]);

      const sessions = await refreshTokenService.listActiveByUserId(
        userId.toString(),
      );

      assert.strictEqual(sessions.length, 2);
      assert.deepStrictEqual(
        new Set(sessions.map((session) => session.sessionId)),
        new Set([sessionA, sessionB]),
      );
    });

    test('should revoke only the requested session', async () => {
      const userId = new Types.ObjectId();
      await fixture.createMany<RefreshToken>(RefreshTokenModel.modelName, [
        RefreshTokenFactory.generate({ userId, sessionId: sessionA }),
        RefreshTokenFactory.generate({ userId, sessionId: sessionB }),
      ]);

      await refreshTokenService.revokeBySessionId(userId.toString(), sessionA);

      const sessions = await fixture.find<RefreshToken>(
        RefreshTokenModel.modelName,
        { userId, revokedAt: null },
      );

      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0]?.sessionId, sessionB);
    });

    test('should throw when the session does not exist', async () => {
      await assert.rejects(
        refreshTokenService.revokeBySessionId(
          new Types.ObjectId().toString(),
          sessionA,
        ),
        new EntityNotFoundError('Session not found'),
      );
    });

    test('should reject an invalid session id', async () => {
      await assert.rejects(
        refreshTokenService.revokeBySessionId(
          new Types.ObjectId().toString(),
          'not-a-uuid',
        ),
        new InvalidArgumentError('sessionId is not a valid UUID'),
      );
    });
  });
});

describe('RefreshToken TTL', () => {
  test('should create a TTL index on the collection', async () => {
    await assertTtlIndex(RefreshTokenModel, 'expiresAt');
  });
});
