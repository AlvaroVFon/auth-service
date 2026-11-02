import type { Application } from 'express';

import { Roles } from '../common/enums/roles.enum';
import type { ApplicationAuthorizationMiddleware } from '../common/middlewares/application-authorization.middleware';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import type { LinksController } from './links.controller';

export class LinksRouter {
  constructor(
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly applicationAuthorizationMiddleware: ApplicationAuthorizationMiddleware,
    private readonly authorizationMiddleware: AuthorizationMiddleware,
    private readonly linksController: LinksController,
    private readonly app: Application,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.app.post(
      '/applications/:applicationId/invitations',
      this.authenticationMiddleware.authenticateAny,
      this.applicationAuthorizationMiddleware.allowApplicationAdmin,
      this.linksController.createInvitation.bind(this.linksController),
    );

    this.app.post(
      '/auth/invitations/accept',
      this.linksController.acceptInvitation.bind(this.linksController),
    );

    this.app.post(
      '/auth/password-reset-links',
      this.authenticationMiddleware.authenticate,
      this.authorizationMiddleware.allowRoles(Roles.OWNER),
      this.linksController.createPasswordResetLink.bind(this.linksController),
    );

    this.app.post(
      '/auth/password-reset-links/accept',
      this.linksController.acceptPasswordResetLink.bind(this.linksController),
    );
  }
}
