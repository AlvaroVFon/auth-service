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
    assert.strictEqual(
      // @ts-expect-error mock.calls exists
      refreshTokenService.revokeAllByUserId.mock.calls[0].arguments[0],
      claims.userId,
    );
    assert.deepStrictEqual(
      // @ts-expect-error mock.calls exists
      refreshTokenService.create.mock.calls[0].arguments,
      [claims.userId, pair.refreshTokenId, pair.refreshExpiresAt, context],
    );
  });

  test('rotates an active refresh session and links its replacement', async () => {
    const jwtService = {
      verifyToken: mock.fn(() => claims),
      signTokenPair: mock.fn(() => pair),
    } as unknown as JwtService;
    const refreshTokenService = {
      findByJti: mock.fn(() => Promise.resolve({ revokedAt: null })),
      revokeByJti: mock.fn(() => Promise.resolve()),
      create: mock.fn(() => Promise.resolve()),
    } as unknown as RefreshTokenService;
    const service = new SessionService(jwtService, refreshTokenService);

    const result = await service.rotate(
      claims.userId!,
      claims.role!,
      'old-refresh-token',
      context,
    );

    assert.deepStrictEqual(result, pair);
    assert.deepStrictEqual(
      // @ts-expect-error mock.calls exists
      refreshTokenService.revokeByJti.mock.calls[0].arguments,
      [claims.jti, pair.refreshTokenId],
    );
  });

  test('rejects a revoked refresh session', async () => {
    const jwtService = {
      verifyToken: mock.fn(() => claims),
    } as unknown as JwtService;
    const refreshTokenService = {
      findByJti: mock.fn(() =>
        Promise.resolve({ revokedAt: new Date('2026-01-01') }),
      ),
    } as unknown as RefreshTokenService;
    const service = new SessionService(jwtService, refreshTokenService);

    await assert.rejects(
      service.rotate(claims.userId!, claims.role!, 'old-refresh-token'),
      new UnauthorizedError('Refresh token has been revoked'),
    );
  });
});
