import { Request, Response, NextFunction } from 'express';
import { InvalidCredentialsError } from '../exceptions/auth.exceptions';
import { JwtService } from '../../libs/jwt/jwt.service';
import { Payload } from '../../libs/jwt/jwt.interfaces';

export class AuthenticationMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  authenticate = (req: Request, _res: Response, next: NextFunction) => {
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

      req.user = { id: payload.userId };

      next();
    } catch (error) {
      console.log('Authentication error:', error);
      next(error);
    }
  };
}
