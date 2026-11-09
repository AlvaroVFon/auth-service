import { NextFunction, Request, Response } from 'express';

import type { ApplicationsPort } from '../../applications';
import { GrantRoles, GrantsPort } from '../../grants';
import { OBJECTID_REGEX } from '../constants/regex';
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

  /**
   * Settings are only exposed for an active application that the caller can
   * administer. Unlike the catalog reader, the owner is also sent a `404` for
   * an archived or unknown application, so the route never reveals whether an
   * inactive application exists.
   */
  allowApplicationSettingsReader = this.createApplicationReader(
    'applicationId',
    { requireActiveForOwner: true, malformedIsNotFound: true },
  );

  private createApplicationReader(
    param: string,
    options: {
      /** Also resolve and require an active application for the owner. */
      requireActiveForOwner?: boolean;
      /** Hide a malformed id as 404 instead of surfacing a 400. */
      malformedIsNotFound?: boolean;
    } = {},
  ) {
    return async (req: Request, _res: Response, next: NextFunction) => {
      try {
        await this.authorizeApplicationAdmin(
          req,
          req.params[param],
          () => new EntityNotFoundError('Application not found'),
          options,
        );
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Shared policy for every application surface: the owner passes (optionally
   * after the application is resolved and required to be active), while
   * everybody else needs the `admin` grant on an active application whose
   * audience matches the token. The caller supplies the error used to hide the
   * resource.
   */
  private async authorizeApplicationAdmin(
    req: Request,
    applicationId: unknown,
    deny: () => Error,
    options: {
      requireActiveForOwner?: boolean;
      malformedIsNotFound?: boolean;
    } = {},
  ): Promise<void> {
    const user = req.user;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!options.requireActiveForOwner && user.role === Roles.OWNER) {
      return;
    }

    if (typeof applicationId !== 'string' || !applicationId) {
      throw deny();
    }

    if (options.malformedIsNotFound && !OBJECTID_REGEX.test(applicationId)) {
      throw deny();
    }

    const application =
      await this.applicationsService.findAssignableById(applicationId);

    if (!application) {
      throw deny();
    }

    if (user.role === Roles.OWNER) {
      return;
    }

    if (user.audience !== undefined && application.audience !== user.audience) {
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
