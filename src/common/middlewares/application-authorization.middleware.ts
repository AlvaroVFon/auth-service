import { NextFunction, Request, Response } from 'express';

import type { ApplicationsPort } from '../../applications';
import { GrantRoles, GrantsPort } from '../../grants';
import { Roles } from '../enums/roles.enum';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../exceptions/auth.exceptions';
import { EntityNotFoundError } from '../exceptions/base.exception';

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

      const application =
        await this.applicationsService.findAssignableById(applicationId);

      if (
        !application ||
        (user.audience !== undefined && application.audience !== user.audience)
      ) {
        throw new ForbiddenError('Access denied');
      }

      const grant = await this.grantsService.findByUserAndApplication(
        user.id,
        applicationId,
        { application },
      );

      if (!grant || grant.role !== GrantRoles.ADMIN) {
        throw new ForbiddenError('Access denied');
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Authorizes the catalog read of a single application for the owner and for
   * the admin of that application. Anything else is a 404: an application the
   * caller cannot read must be indistinguishable from one that does not exist,
   * so the route can never be used to enumerate applications.
   */
  allowApplicationReader = async (
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

      const applicationId = req.params.id;

      if (typeof applicationId !== 'string' || !applicationId) {
        throw new EntityNotFoundError('Application not found');
      }

      const application =
        await this.applicationsService.findAssignableById(applicationId);

      if (
        !application ||
        (user.audience !== undefined && application.audience !== user.audience)
      ) {
        throw new EntityNotFoundError('Application not found');
      }

      const grant = await this.grantsService.findByUserAndApplication(
        user.id,
        applicationId,
        { application },
      );

      if (!grant || grant.role !== GrantRoles.ADMIN) {
        throw new EntityNotFoundError('Application not found');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
