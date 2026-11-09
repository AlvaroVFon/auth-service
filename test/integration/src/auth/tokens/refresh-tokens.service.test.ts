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

    test('should persist the session start time across rotations', async () => {
      const startedAt = new Date('2026-01-01T10:00:00.000Z');
      const token = await refreshTokenService.create(
        new Types.ObjectId().toString(),
        '550e8400-e29b-41d4-a716-446655440022',
        new Date(Date.now() + 60_000),
        undefined,
        { sessionId: sessionA, sessionStartedAt: startedAt },
      );

      assert.strictEqual(
        token.sessionStartedAt?.getTime(),
        startedAt.getTime(),
      );
    });

    test('should revoke a legacy token using its jti as session id', async () => {
      const userId = new Types.ObjectId();
      const jti = '550e8400-e29b-41d4-a716-446655440023';

      // Legacy documents predate sessionId, so insert one without the field.
      await RefreshTokenModel.collection.insertOne({
        userId,
        jti,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedByJti: null,
        ipAddress: null,
        userAgent: null,
        audience: null,
        type: TokenTypes.REFRESH,
      });

      await refreshTokenService.revokeBySessionId(userId.toString(), jti);

      const stored = await fixture.findOne<RefreshToken>(
        RefreshTokenModel.modelName,
        { jti },
      );
      assert.ok(stored?.revokedAt instanceof Date);
    });

    test('should treat revoking an already revoked session as a no-op', async () => {
      const userId = new Types.ObjectId();
      await fixture.create<RefreshToken>(
        RefreshTokenModel.modelName,
        RefreshTokenFactory.generate({
          userId,
          sessionId: sessionA,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      );

      await refreshTokenService.revokeBySessionId(userId.toString(), sessionA);
      await refreshTokenService.revokeBySessionId(userId.toString(), sessionA);
    });

    test('should revoke the oldest sessions beyond the cap', async () => {
      const userId = new Types.ObjectId();
      const now = Date.now();

      await fixture.createMany<RefreshToken>(RefreshTokenModel.modelName, [
        RefreshTokenFactory.generate({
          userId,
          sessionId: sessionA,
          lastActivityAt: new Date(now - 3000),
          expiresAt: new Date(now + 60_000),
        }),
        RefreshTokenFactory.generate({
          userId,
          sessionId: sessionB,
          lastActivityAt: new Date(now - 2000),
          expiresAt: new Date(now + 60_000),
        }),
        RefreshTokenFactory.generate({
          userId,
          sessionId: '6f1c2a2e-3333-4333-a333-333333333333',
          lastActivityAt: new Date(now - 1000),
          expiresAt: new Date(now + 60_000),
        }),
      ]);

      await refreshTokenService.pruneActiveSessions(userId.toString(), 2);

      const active = await fixture.find<RefreshToken>(
        RefreshTokenModel.modelName,
        { userId, revokedAt: null },
      );

      assert.strictEqual(active.length, 2);
      assert.deepStrictEqual(
        new Set(active.map((token) => token.sessionId)),
        new Set([sessionB, '6f1c2a2e-3333-4333-a333-333333333333']),
      );
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

describe('RefreshTokenService revokeAllByAudience', () => {
  let refreshTokenService: RefreshTokenService;

  before(() => {
    refreshTokenService = new RefreshTokenService(RefreshTokenModel);
  });

  test('rejects an empty audience', async () => {
    await assert.rejects(
      () => refreshTokenService.revokeAllByAudience('   '),
      new InvalidArgumentError('audience is required'),
    );
  });

  test('rejects an invalid excluded user id', async () => {
    await assert.rejects(
      () => refreshTokenService.revokeAllByAudience('app-aud', ['bad-id']),
      new InvalidArgumentError('excluded userId is not a valid ObjectId'),
    );
  });

  test('revokes only the active sessions of the audience, excluding users', async () => {
    const audience = 'app-aud';
    const excludedUserId = new Types.ObjectId();
    const expiresAt = new Date(Date.now() + 60_000);

    const active = RefreshTokenFactory.generate({ audience, expiresAt });
    const alsoActive = RefreshTokenFactory.generate({ audience, expiresAt });
    const excluded = RefreshTokenFactory.generate({
      audience,
      expiresAt,
      userId: excludedUserId,
    });
    const expired = RefreshTokenFactory.generate({
      audience,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const alreadyRevoked = RefreshTokenFactory.generate({
      audience,
      expiresAt,
      revokedAt: new Date(),
    });
    const otherAudience = RefreshTokenFactory.generate({
      audience: 'other-aud',
      expiresAt,
    });

    await fixture.createMany<RefreshToken>(RefreshTokenModel.modelName, [
      active,
      alsoActive,
      excluded,
      expired,
      alreadyRevoked,
      otherAudience,
    ]);

    const result = await refreshTokenService.revokeAllByAudience(audience, [
      excludedUserId.toString(),
    ]);

    assert.strictEqual(result.revoked, 2);
    assert.strictEqual(result.complete, true);
    assert.deepStrictEqual(
      result.sessions.map((session) => session.jti).sort(),
      [active.jti, alsoActive.jti].sort(),
    );
    for (const session of result.sessions) {
      assert.ok(session.sessionId);
      assert.match(session.userId, /^[0-9a-f]{24}$/);
    }

    const persisted = async (jti: string) =>
      fixture.findOne<RefreshToken>(RefreshTokenModel.modelName, { jti });

    assert.ok((await persisted(active.jti))?.revokedAt);
    assert.ok((await persisted(alsoActive.jti))?.revokedAt);
    assert.strictEqual((await persisted(excluded.jti))?.revokedAt, null);
    assert.strictEqual((await persisted(otherAudience.jti))?.revokedAt, null);
    assert.ok((await persisted(alreadyRevoked.jti))?.revokedAt);
  });

  test('revokes an audience that spans more than one batch', async () => {
    const audience = 'big-aud';
    const expiresAt = new Date(Date.now() + 60_000);
    const tokens = Array.from({ length: 501 }, () =>
      RefreshTokenFactory.generate({ audience, expiresAt }),
    );

    await fixture.createMany<RefreshToken>(RefreshTokenModel.modelName, tokens);

    const result = await refreshTokenService.revokeAllByAudience(audience);

    assert.strictEqual(result.revoked, 501);
    assert.strictEqual(result.sessions.length, 501);
    assert.strictEqual(result.complete, true);

    const active = await fixture.find<RefreshToken>(
      RefreshTokenModel.modelName,
      { audience, revokedAt: null },
    );
    assert.strictEqual(active.length, 0);
  });

  test('returns an empty result for an audience without active sessions', async () => {
    const result = await refreshTokenService.revokeAllByAudience('empty-aud');

    assert.deepStrictEqual(result, {
      sessions: [],
      revoked: 0,
      complete: true,
    });
  });
});

describe('RefreshTokenService.countActiveSessions', () => {
  test('should count only non-revoked, non-expired tokens', async () => {
    const userId = new Types.ObjectId();
    await fixture.createMany<RefreshToken>(RefreshTokenModel.modelName, [
      RefreshTokenFactory.generate({
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      }),
      RefreshTokenFactory.generate({
        userId,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
      }),
      RefreshTokenFactory.generate({
        userId,
        expiresAt: new Date(Date.now() - 60_000),
      }),
    ]);

    assert.strictEqual(
      await new RefreshTokenService(RefreshTokenModel).countActiveSessions(),
      1,
    );
  });
});

describe('RefreshTokenService.pruneActiveSessions by audience', () => {
  test('prunes only the requested audience and leaves other applications intact', async () => {
    const userId = new Types.ObjectId();
    const now = Date.now();
    const tokens = [
      { audience: 'app-a', sessionId: '6f1c2a2e-1111-4111-a111-111111111111' },
      { audience: 'app-a', sessionId: '6f1c2a2e-2222-4222-a222-222222222222' },
      { audience: 'app-b', sessionId: '6f1c2a2e-3333-4333-a333-333333333333' },
    ];
    await fixture.createMany<RefreshToken>(
      RefreshTokenModel.modelName,
      tokens.map((token, index) =>
        RefreshTokenFactory.generate({
          userId,
          audience: token.audience,
          sessionId: token.sessionId,
          lastActivityAt: new Date(now - (tokens.length - index) * 1000),
          expiresAt: new Date(now + 60_000),
        }),
      ),
    );

    await new RefreshTokenService(RefreshTokenModel).pruneActiveSessions(
      userId.toString(),
      1,
      'app-a',
    );

    const active = await fixture.find<RefreshToken>(
      RefreshTokenModel.modelName,
      { userId, revokedAt: null },
    );

    assert.deepStrictEqual(
      active
        .map((token) => token.sessionId ?? '')
        .sort((a, b) => a.localeCompare(b)),
      [
        '6f1c2a2e-2222-4222-a222-222222222222',
        '6f1c2a2e-3333-4333-a333-333333333333',
      ],
    );
  });
});
