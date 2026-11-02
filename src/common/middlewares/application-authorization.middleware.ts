import { NextFunction, Request, Response } from 'express';

import type { ApplicationsPort } from '../../applications';
import { GrantRoles, GrantsPort } from '../../grants';
import { Roles } from '../enums/roles.enum';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../exceptions/auth.exceptions';

export class ApplicationAuthorizationMiddleware {
  constructor(
    private readonly grantsService: GrantsPort,
    private readonly applicationsService: ApplicationsPort,
  ) {}

  allowApplicationAdmin = async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ) => {
    try {
      const user = req.user;

      if (!user) {
        throw new UnauthorizedError('Authentication required');
      }

      if (user.role === Roles.OWNER) {
        next();
        return;
      }

      const applicationId = req.params.applicationId;

      if (typeof applicationId !== 'string' || !applicationId) {
        throw new ForbiddenError('Access denied');
      }

      if (user.audience !== undefined) {
        const application =
          await this.applicationsService.findById(applicationId);

        if (!application || application.audience !== user.audience) {
          throw new ForbiddenError('Access denied');
        }
      }

      const grant = await this.grantsService.findByUserAndApplication(
        user.id,
        applicationId,
      );

      if (!grant || grant.role !== GrantRoles.ADMIN) {
        throw new ForbiddenError('Access denied');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
