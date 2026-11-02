import { NextFunction, Request, Response } from 'express';

import { GrantRoles } from '../../grants';
import { Roles } from '../enums/roles.enum';
import { ForbiddenError } from '../exceptions/auth.exceptions';

const isGlobalRole = (role: string): role is Roles =>
  (Object.values(Roles) as string[]).includes(role);

const isGrantRole = (role: string): role is GrantRoles =>
  (Object.values(GrantRoles) as string[]).includes(role);

export class AuthorizationMiddleware {
  allowRoles = (...roles: Roles[]) => {
    return (req: Request, _res: Response, next: NextFunction) => {
      try {
        const user = req.user;

        // Application-scoped tokens carry a grant role (`viewer`, `editor`,
        // `admin`) whose values overlap with global roles. Reject them by their
        // audience so an app admin can never satisfy a global role guard.
        if (
          !user ||
          user.audience !== undefined ||
          !isGlobalRole(user.role) ||
          !roles.includes(user.role)
        ) {
          throw new ForbiddenError('Access denied');
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  allowGrantRoles = (audience: string, ...roles: GrantRoles[]) => {
    return (req: Request, _res: Response, next: NextFunction) => {
      try {
        const user = req.user;

        if (
          !user ||
          user.audience !== audience ||
          !isGrantRole(user.role) ||
          !roles.includes(user.role)
        ) {
          throw new ForbiddenError('Access denied');
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };
}
