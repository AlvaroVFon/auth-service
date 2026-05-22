import type { Request, Response, NextFunction } from 'express';
import { JwtService } from '../../libs/jwt/jwt.service';
import { TenantPayload } from '../../libs/jwt/jwt.interfaces';
import { InvalidCredentialsError } from '../exceptions/auth.exceptions';

export class TenantAuthenticationMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  authenticate = (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader?.startsWith('Bearer ')) {
        throw new Error('Invalid or missing authorization header');
      }

      const token = authHeader.slice(7).trim();

      const payload = this.jwtService.verifyToken(token) as TenantPayload;

      if (!payload?.tenantId) {
        throw new InvalidCredentialsError('Invalid token payload');
      }

      req.tenantId = payload.tenantId;

      next();
    } catch (error) {
      next(error);
    }
  };
}
