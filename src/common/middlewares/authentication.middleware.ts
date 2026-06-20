import { Request, Response, NextFunction } from 'express';
import { InvalidCredentialsError } from '../exceptions/auth.exceptions';
import { JwtService } from '../../libs/jwt/jwt.service';
import { BlacklistService } from '../../auth/tokens/blacklist.service';
import { Payload } from '../../libs/jwt/jwt.interfaces';
import { TokenTypes } from '../../libs/jwt/token-types.enum';

export class AuthenticationMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly blacklistService: BlacklistService,
  ) {}

  authenticate = async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader?.startsWith('Bearer ')) {
        throw new InvalidCredentialsError(
          'Invalid or missing authorization header',
        );
      }

      const token = authHeader.slice(7).trim();

      const payload = this.jwtService.verifyToken(token) as Payload;

      if (!payload?.userId) {
        throw new InvalidCredentialsError('Invalid token payload');
      }

      if (payload.type !== TokenTypes.ACCESS) {
        throw new InvalidCredentialsError('Invalid token payload');
      }

      if (!payload.jti) {
        throw new InvalidCredentialsError('Invalid token payload');
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
        expiresAt: new Date((payload as Payload & { exp: number }).exp * 1000),
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
