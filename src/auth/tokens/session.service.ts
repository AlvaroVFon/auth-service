import { Roles } from '../../common/enums/roles.enum';
import { UnauthorizedError } from '../../common/exceptions/auth.exceptions';
import { EntityNotFoundError } from '../../common/exceptions/base.exception';
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
    role: Roles,
    ctx?: RequestContext,
  ): Promise<TokenPair> {
    const session = this.jwtService.issueSession(userId, role);

    await this.refreshTokenService.revokeAllByUserId(userId);
    await this.persistRefreshToken(userId, session, ctx);

    return session;
  }

  async rotate(
    userId: string,
    role: Roles,
    refreshToken: string,
    ctx?: RequestContext,
  ): Promise<TokenPair> {
    const claims = this.jwtService.verifyToken(refreshToken);

    if (
      claims.type !== TokenTypes.REFRESH ||
      claims.userId !== userId ||
      !claims.jti
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

    const session = this.jwtService.issueSession(userId, role);

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
    await this.persistRefreshToken(userId, session, ctx);

    return session;
  }

  async revokeAll(userId: string): Promise<void> {
    await this.refreshTokenService.revokeAllByUserId(userId);
  }

  private async persistRefreshToken(
    userId: string,
    session: TokenPair,
    ctx?: RequestContext,
  ): Promise<void> {
    await this.refreshTokenService.create(
      userId,
      session.refreshTokenId,
      session.refreshExpiresAt,
      ctx,
    );
  }
}
