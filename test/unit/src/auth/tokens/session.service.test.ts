import { RefreshTokenService } from '../../../../../src/auth/tokens/refresh-token.service';
import { SessionService } from '../../../../../src/auth/tokens/session.service';
import { Roles } from '../../../../../src/common/enums/roles.enum';
import { UnauthorizedError } from '../../../../../src/common/exceptions/auth.exceptions';
import {
  TokenPair,
  TokenClaims,
} from '../../../../../src/libs/jwt/jwt.interfaces';
import { JwtService } from '../../../../../src/libs/jwt/jwt.service';
import { TokenTypes } from '../../../../../src/libs/jwt/token-types.enum';

describe('SessionService', () => {
  const pair: TokenPair = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    refreshTokenId: 'refresh-jti',
    refreshExpiresAt: new Date('2026-01-01'),
  };
  const claims: TokenClaims = {
    userId: '0'.repeat(24),
    role: Roles.USER,
    type: TokenTypes.REFRESH,
    jti: 'current-jti',
    exp: 1,
  };
  const context = { ipAddress: '127.0.0.1', userAgent: 'test-agent' };
  const sessionId = '6f1c2a2e-1111-4111-a111-111111111111';

  test('creates an independent login session without revoking others', async () => {
    const jwtService = {
      signTokenPair: mock.fn(() => pair),
    } as unknown as JwtService;
    const refreshTokenService = {
      revokeAllByUserId: mock.fn(() => Promise.resolve()),
      create: mock.fn(() => Promise.resolve()),
    } as unknown as RefreshTokenService;
    const service = new SessionService(jwtService, refreshTokenService);

    const result = await service.create(claims.userId!, claims.role!, context);

    assert.deepStrictEqual(result, pair);
    assert.deepStrictEqual(
      // @ts-expect-error mock.calls exists
      refreshTokenService.revokeAllByUserId.mock.callCount(),
      0,
    );

    // @ts-expect-error mock.calls exists
    const args = refreshTokenService.create.mock.calls[0].arguments;
    assert.strictEqual(args[0], claims.userId);
    assert.strictEqual(args[1], pair.refreshTokenId);
    assert.strictEqual(args[2], pair.refreshExpiresAt);
    assert.strictEqual(args[3], context);
    assert.match(args[4].sessionId, /^[0-9a-f-]{36}$/);
    assert.strictEqual(args[4].audience, undefined);
  });

  test('binds a login session to the application audience', async () => {
    const jwtService = {
      signTokenPair: mock.fn(() => pair),
    } as unknown as JwtService;
    const refreshTokenService = {
      create: mock.fn(() => Promise.resolve()),
    } as unknown as RefreshTokenService;
    const service = new SessionService(jwtService, refreshTokenService);

    await service.create(claims.userId!, claims.role!, context, 'app-aud');

    assert.deepStrictEqual(
      // @ts-expect-error mock.calls exists
      jwtService.signTokenPair.mock.calls[0].arguments,
      [claims.userId, claims.role, 'app-aud'],
    );
    // @ts-expect-error mock.calls exists
    const args = refreshTokenService.create.mock.calls[0].arguments;
    assert.strictEqual(args[4].audience, 'app-aud');
  });

  test('rotates an application session keeping its audience and session', async () => {
    const wrappedClaims = { ...claims, aud: 'app-aud' };
    const jwtService = {
      signTokenPair: mock.fn(() => pair),
    } as unknown as JwtService;
    const refreshTokenService = {
      findByJti: mock.fn(() =>
        Promise.resolve({
          userId: claims.userId,
          revokedAt: null,
          sessionId,
        }),
      ),
      revokeByJti: mock.fn(() => Promise.resolve()),
      create: mock.fn(() => Promise.resolve()),
    } as unknown as RefreshTokenService;
    const service = new SessionService(jwtService, refreshTokenService);

    await service.rotate(wrappedClaims, claims.role!, context);

    assert.deepStrictEqual(
      // @ts-expect-error mock.calls exists
      jwtService.signTokenPair.mock.calls[0].arguments,
      [claims.userId, claims.role, 'app-aud'],
    );
    // @ts-expect-error mock.calls exists
    const args = refreshTokenService.create.mock.calls[0].arguments;
    assert.strictEqual(args[4].sessionId, sessionId);
    assert.strictEqual(args[4].audience, 'app-aud');
  });

  test('rejects a stored token that belongs to another user', async () => {
    const jwtService = {} as unknown as JwtService;
    const refreshTokenService = {
      findByJti: mock.fn(() =>
        Promise.resolve({ userId: '1'.repeat(24), revokedAt: null }),
      ),
    } as unknown as RefreshTokenService;
    const service = new SessionService(jwtService, refreshTokenService);

    await assert.rejects(
      service.rotate(claims, claims.role!),
      new UnauthorizedError('Invalid refresh token'),
    );
  });

  test('rejects a token that is not a refresh token', async () => {
    const jwtService = {} as unknown as JwtService;
    const refreshTokenService = {} as unknown as RefreshTokenService;
    const service = new SessionService(jwtService, refreshTokenService);

    await assert.rejects(
      service.rotate({ ...claims, type: TokenTypes.ACCESS }, claims.role!),
      new UnauthorizedError('Invalid refresh token'),
    );
  });

  test('rotates an active refresh session and links its replacement', async () => {
    const jwtService = {
      signTokenPair: mock.fn(() => pair),
    } as unknown as JwtService;
    const refreshTokenService = {
      findByJti: mock.fn(() =>
        Promise.resolve({
          userId: claims.userId,
          revokedAt: null,
          sessionId,
        }),
      ),
      revokeByJti: mock.fn(() => Promise.resolve()),
      create: mock.fn(() => Promise.resolve()),
    } as unknown as RefreshTokenService;
    const service = new SessionService(jwtService, refreshTokenService);

    const result = await service.rotate(claims, claims.role!, context);

    assert.deepStrictEqual(result, pair);
    assert.deepStrictEqual(
      // @ts-expect-error mock.calls exists
      refreshTokenService.revokeByJti.mock.calls[0].arguments,
      [claims.jti, pair.refreshTokenId],
    );
    // @ts-expect-error mock.calls exists
    const args = refreshTokenService.create.mock.calls[0].arguments;
    assert.strictEqual(args[4].sessionId, sessionId);
  });

  test('rejects a revoked refresh session', async () => {
    const jwtService = {} as unknown as JwtService;
    const refreshTokenService = {
      findByJti: mock.fn(() =>
        Promise.resolve({
          userId: claims.userId,
          revokedAt: new Date('2026-01-01'),
        }),
      ),
    } as unknown as RefreshTokenService;
    const service = new SessionService(jwtService, refreshTokenService);

    await assert.rejects(
      service.rotate(claims, claims.role!),
      new UnauthorizedError('Refresh token has been revoked'),
    );
  });

  test('lists active sessions as views', async () => {
    const createdAt = new Date('2026-01-01');
    const lastActivityAt = new Date('2026-01-02');
    const refreshTokenService = {
      listActiveByUserId: mock.fn(async () => [
        {
          sessionId,
          jti: 'jti',
          userAgent: 'Mozilla/5.0',
          audience: 'app-aud',
          ipAddress: '127.0.0.1',
          createdAt,
          lastActivityAt,
          expiresAt: new Date('2026-02-01'),
          revokedAt: null,
        },
      ]),
    } as unknown as RefreshTokenService;
    const service = new SessionService(
      {} as unknown as JwtService,
      refreshTokenService,
    );

    const sessions = await service.list(claims.userId!);

    assert.deepStrictEqual(sessions, [
      {
        id: sessionId,
        device: 'Mozilla/5.0',
        application: 'app-aud',
        ipAddress: '127.0.0.1',
        createdAt,
        lastActivityAt,
        expiresAt: new Date('2026-02-01'),
      },
    ]);
  });

  test('revokes a single session', async () => {
    const refreshTokenService = {
      revokeBySessionId: mock.fn(() => Promise.resolve()),
    } as unknown as RefreshTokenService;
    const service = new SessionService(
      {} as unknown as JwtService,
      refreshTokenService,
    );

    await service.revoke(claims.userId!, sessionId);

    assert.deepStrictEqual(
      // @ts-expect-error mock.calls exists
      refreshTokenService.revokeBySessionId.mock.calls[0].arguments,
      [claims.userId, sessionId],
    );
  });
});
