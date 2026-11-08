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
      await this.authorizeApplicationAdmin(
        req,
        req.params.applicationId,
        () => new ForbiddenError('Access denied'),
      );
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
   *
   * The route parameter is explicit so mounting the reader on a surface that
   * names it differently is a visible decision instead of an implicit contract.
   */
  allowApplicationReader = this.createApplicationReader('id');

  private createApplicationReader(param: string) {
    return async (req: Request, _res: Response, next: NextFunction) => {
      try {
        await this.authorizeApplicationAdmin(
          req,
          req.params[param],
          () => new EntityNotFoundError('Application not found'),
        );
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Shared policy for both application surfaces: the owner always passes;
   * everybody else needs the `admin` grant on an active application whose
   * audience matches the token. The only per-route difference is the error
   * used to hide the resource, which the caller supplies.
   */
  private async authorizeApplicationAdmin(
    req: Request,
    applicationId: unknown,
    deny: () => Error,
  ): Promise<void> {
    const user = req.user;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (user.role === Roles.OWNER) {
      return;
    }

    if (typeof applicationId !== 'string' || !applicationId) {
      throw deny();
    }

    const application =
      await this.applicationsService.findAssignableById(applicationId);

    if (
      !application ||
      (user.audience !== undefined && application.audience !== user.audience)
    ) {
      throw deny();
    }

    const grant = await this.grantsService.findByUserAndApplication(
      user.id,
      applicationId,
      { application },
    );

    if (!grant || grant.role !== GrantRoles.ADMIN) {
      throw deny();
    }
  }
}
