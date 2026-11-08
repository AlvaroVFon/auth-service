import { randomUUID } from 'node:crypto';

import { UnauthorizedError } from '../../common/exceptions/auth.exceptions';
import { EntityNotFoundError } from '../../common/exceptions/base.exception';
import type { TokenClaims, TokenRole } from '../../libs/jwt';
import { JwtService, TokenPair, TokenTypes } from '../../libs/jwt';
import { RefreshToken } from './refresh-token.interface';
import { RefreshTokenService } from './refresh-token.service';
import { RequestContext } from './request-context.type';

export interface SessionView {
  id: string;
  device: string | null;
  application: string | null;
  ipAddress: string | null;
  createdAt: Date | null;
  lastActivityAt: Date;
  expiresAt: Date;
}

export class SessionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly maxSessionsPerUser = 50,
  ) {}

  async create(
    userId: string,
    role: TokenRole,
    ctx?: RequestContext,
    audience?: string,
  ): Promise<TokenPair> {
    const session = this.jwtService.signTokenPair(userId, role, audience);

    await this.persistRefreshToken(
      userId,
      session,
      randomUUID(),
      ctx,
      audience,
    );
    await this.refreshTokenService.pruneActiveSessions(
      userId,
      this.maxSessionsPerUser,
    );

    return session;
  }

  /**
   * Rotates an already verified refresh token. The caller owns verification so
   * each refresh pays a single signature check; the stored-token guard below
   * is what actually protects against a forged or swapped jti.
   */
  async rotate(
    claims: TokenClaims,
    role: TokenRole,
    ctx?: RequestContext,
  ): Promise<TokenPair> {
    if (claims.type !== TokenTypes.REFRESH || !claims.userId || !claims.jti) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const storedToken = await this.refreshTokenService.findByJti(claims.jti);

    if (!storedToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (storedToken.revokedAt !== null) {
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    if (storedToken.userId.toString() !== claims.userId) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const userId = claims.userId;
    const audience = claims.aud;
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
    await this.persistRefreshToken(
      userId,
      session,
      storedToken.sessionId ?? claims.jti,
      ctx,
      audience,
      storedToken.sessionStartedAt ?? storedToken.createdAt,
    );

    return session;
  }

  async revokeAllWithIds(userId: string, audience?: string): Promise<string[]> {
    const revoked = await this.refreshTokenService.revokeAllByUserId(
      userId,
      audience,
    );

    return revoked.map((token) => token.sessionId);
  }

  async revokeAll(userId: string, audience?: string): Promise<void> {
    await this.refreshTokenService.revokeAllBulk(userId, audience);
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

  async list(userId: string): Promise<SessionView[]> {
    const tokens = await this.refreshTokenService.listActiveByUserId(userId);

    return tokens.map((token) => this.toView(token));
  }

  async revoke(userId: string, sessionId: string): Promise<boolean> {
    return this.refreshTokenService.revokeBySessionId(userId, sessionId);
  }

  private toView(token: RefreshToken): SessionView {
    return {
      id: token.sessionId ?? token.jti,
      device: token.userAgent ?? null,
      application: token.audience ?? null,
      ipAddress: token.ipAddress ?? null,
      createdAt: token.sessionStartedAt ?? token.createdAt ?? null,
      lastActivityAt:
        token.lastActivityAt ?? token.createdAt ?? token.expiresAt,
      expiresAt: token.expiresAt,
    };
  }

  private async persistRefreshToken(
    userId: string,
    session: TokenPair,
    sessionId: string,
    ctx?: RequestContext,
    audience?: string,
    sessionStartedAt?: Date,
  ): Promise<void> {
    await this.refreshTokenService.create(
      userId,
      session.refreshTokenId,
      session.refreshExpiresAt,
      ctx,
      {
        sessionId,
        ...(audience === undefined ? {} : { audience }),
        ...(sessionStartedAt === undefined ? {} : { sessionStartedAt }),
      },
    );
  }
}
