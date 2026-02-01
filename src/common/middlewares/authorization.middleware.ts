import { NextFunction, Request, Response } from 'express';
import { Roles } from '../enums/roles.enum';
import { ForbiddenError } from '../exceptions/auth.exceptions';

export class AuthorizationMiddleware {
  allowRoles = (...roles: Roles[]) => {
    return (req: Request, _res: Response, next: NextFunction) => {
      try {
        const userRole = req.user?.role;

        if (!userRole || !roles.includes(userRole)) {
          throw new ForbiddenError('Access denied');
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };
}
