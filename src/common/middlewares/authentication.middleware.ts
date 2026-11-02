import { Request, Response, NextFunction } from 'express';

import { JwtService, TokenTypes } from '../../libs/jwt';
import { InvalidCredentialsError } from '../exceptions/auth.exceptions';
import { TokenBlacklistPort } from '../ports/token-blacklist.port';

export class AuthenticationMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly blacklistService: TokenBlacklistPort,
  ) {}

  authenticate = async (req: Request, _res: Response, next: NextFunction) => {
    await this.authenticateRequest(req, next);
  };

  authenticateAny = async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ) => {
    await this.authenticateRequest(req, next, { anyAudience: true });
  };

  authenticateForAudience(audience: string) {
    return async (req: Request, _res: Response, next: NextFunction) => {
      await this.authenticateRequest(req, next, { audience });
    };
  }

  private async authenticateRequest(
    req: Request,
    next: NextFunction,
    options: { audience?: string; anyAudience?: boolean } = {},
  ): Promise<void> {
    const { audience } = options;
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader?.startsWith('Bearer ')) {
        throw new InvalidCredentialsError(
          'Invalid or missing authorization header',
        );
      }

      const token = authHeader.slice(7).trim();

      const payload =
        audience === undefined
          ? this.jwtService.verifyToken(token)
          : this.jwtService.verifyToken(token, { audience });

      if (!payload.userId || !payload.role) {
        throw new InvalidCredentialsError('Invalid token payload');
      }

      if (payload.type !== TokenTypes.ACCESS) {
        throw new InvalidCredentialsError('Invalid token payload');
      }

      if (!payload.jti) {
        throw new InvalidCredentialsError('Invalid token payload');
      }

      if (!options.anyAudience) {
        const audienceMismatch =
          audience === undefined
            ? payload.aud !== undefined
            : payload.aud !== audience;

        if (audienceMismatch) {
          throw new InvalidCredentialsError('Invalid token payload');
        }
      }

      const isBlacklisted = await this.blacklistService.isBlacklisted(
        payload.jti,
      );

      if (isBlacklisted) {
        throw new InvalidCredentialsError('Invalid token payload');
      }

      req.user = {
        id: payload.userId,
        role: payload.role,
        jti: payload.jti,
        expiresAt: new Date(payload.exp * 1000),
        ...(payload.aud === undefined ? {} : { audience: payload.aud }),
      };

      next();
    } catch (error) {
      next(error);
    }
  }
}
