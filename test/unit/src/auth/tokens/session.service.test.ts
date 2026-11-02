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

  test('creates a login session after revoking previous sessions', async () => {
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
      refreshTokenService.revokeAllByUserId.mock.calls[0].arguments,
      [claims.userId, undefined],
    );
    assert.deepStrictEqual(
      // @ts-expect-error mock.calls exists
      refreshTokenService.create.mock.calls[0].arguments,
      [
        claims.userId,
        pair.refreshTokenId,
        pair.refreshExpiresAt,
        context,
        undefined,
      ],
    );
  });

  test('binds a login session to the application audience', async () => {
    const jwtService = {
      signTokenPair: mock.fn(() => pair),
    } as unknown as JwtService;
    const refreshTokenService = {
      revokeAllByUserId: mock.fn(() => Promise.resolve()),
      create: mock.fn(() => Promise.resolve()),
    } as unknown as RefreshTokenService;
    const service = new SessionService(jwtService, refreshTokenService);

    await service.create(claims.userId!, claims.role!, context, 'app-aud');

    assert.deepStrictEqual(
      // @ts-expect-error mock.calls exists
      jwtService.signTokenPair.mock.calls[0].arguments,
      [claims.userId, claims.role, 'app-aud'],
    );
    assert.deepStrictEqual(
      // @ts-expect-error mock.calls exists
      refreshTokenService.revokeAllByUserId.mock.calls[0].arguments,
      [claims.userId, 'app-aud'],
    );
    assert.deepStrictEqual(
      // @ts-expect-error mock.calls exists
      refreshTokenService.create.mock.calls[0].arguments,
      [
        claims.userId,
        pair.refreshTokenId,
        pair.refreshExpiresAt,
        context,
        'app-aud',
      ],
    );
  });

  test('rotates an application session keeping its audience', async () => {
    const wrappedClaims = { ...claims, aud: 'app-aud' };
    const jwtService = {
      signTokenPair: mock.fn(() => pair),
    } as unknown as JwtService;
    const refreshTokenService = {
      findByJti: mock.fn(() =>
        Promise.resolve({ userId: claims.userId, revokedAt: null }),
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
    assert.deepStrictEqual(
      // @ts-expect-error mock.calls exists
      refreshTokenService.create.mock.calls[0].arguments,
      [
        claims.userId,
        pair.refreshTokenId,
        pair.refreshExpiresAt,
        context,
        'app-aud',
      ],
    );
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
        Promise.resolve({ userId: claims.userId, revokedAt: null }),
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
});
