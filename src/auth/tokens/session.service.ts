import { UnauthorizedError } from '../../common/exceptions/auth.exceptions';
import { EntityNotFoundError } from '../../common/exceptions/base.exception';
import type { TokenRole } from '../../libs/jwt';
import { JwtService, TokenPair, TokenTypes } from '../../libs/jwt';
import { RefreshTokenService } from './refresh-token.service';
import { RequestContext } from './request-context.type';

export class SessionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async create(
    userId: string,
    role: TokenRole,
    ctx?: RequestContext,
    audience?: string,
  ): Promise<TokenPair> {
    const session = this.jwtService.signTokenPair(userId, role, audience);

    // Only the audience being logged into is rotated; other applications keep
    // their own refresh tokens. A global (owner) login passes undefined and
    // still revokes every session.
    await this.refreshTokenService.revokeAllByUserId(userId, audience);
    await this.persistRefreshToken(userId, session, ctx, audience);

    return session;
  }

  async rotate(
    userId: string,
    role: TokenRole,
    refreshToken: string,
    ctx?: RequestContext,
    audience?: string,
  ): Promise<TokenPair> {
    const claims = this.jwtService.verifyToken(refreshToken);

    if (
      claims.type !== TokenTypes.REFRESH ||
      claims.userId !== userId ||
      !claims.jti ||
      claims.aud !== audience
    ) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const storedToken = await this.refreshTokenService.findByJti(claims.jti);

    if (!storedToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (storedToken.revokedAt !== null) {
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    const session = this.jwtService.signTokenPair(userId, role, audience);

    try {
      await this.refreshTokenService.revokeByJti(
        claims.jti,
        session.refreshTokenId,
      );
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        throw new UnauthorizedError('Refresh token has been revoked');
      }
      throw error;
    }
    await this.persistRefreshToken(userId, session, ctx, audience);

    return session;
  }

  async revokeAll(userId: string, audience?: string): Promise<void> {
    await this.refreshTokenService.revokeAllByUserId(userId, audience);
  }

  async revokeByRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const claims = this.jwtService.verifyToken(refreshToken);

    if (
      claims.type !== TokenTypes.REFRESH ||
      claims.userId !== userId ||
      !claims.jti
    ) {
      return;
    }

    try {
      await this.refreshTokenService.revokeByJti(claims.jti);
    } catch (error) {
      if (!(error instanceof EntityNotFoundError)) {
        throw error;
      }
    }
  }

  private async persistRefreshToken(
    userId: string,
    session: TokenPair,
    ctx?: RequestContext,
    audience?: string,
  ): Promise<void> {
    await this.refreshTokenService.create(
      userId,
      session.refreshTokenId,
      session.refreshExpiresAt,
      ctx,
      audience,
    );
  }
}
