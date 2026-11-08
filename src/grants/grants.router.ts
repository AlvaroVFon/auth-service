import type { Application } from 'express';

import type { ApplicationAuthorizationMiddleware } from '../common/middlewares/application-authorization.middleware';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { GrantsController } from './grants.controller';

export class GrantsRouter {
  constructor(
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly applicationAuthorizationMiddleware: ApplicationAuthorizationMiddleware,
    private readonly grantsController: GrantsController,
    private readonly app: Application,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    const appAdminOnly = [
      this.authenticationMiddleware.authenticateAny,
      this.applicationAuthorizationMiddleware.allowApplicationAdmin,
    ];

    this.app.put(
      '/applications/:applicationId/grants',
      ...appAdminOnly,
      this.grantsController.upsert.bind(this.grantsController),
    );

    this.app.get(
      '/applications/:applicationId/members',
      ...appAdminOnly,
      this.grantsController.listMembers.bind(this.grantsController),
    );

    this.app.get(
      '/applications/:applicationId/grants',
      ...appAdminOnly,
      this.grantsController.list.bind(this.grantsController),
    );

    this.app.get(
      '/applications/:applicationId/grants/:userId',
      ...appAdminOnly,
      this.grantsController.getOne.bind(this.grantsController),
    );

    this.app.delete(
      '/applications/:applicationId/grants/:userId',
      ...appAdminOnly,
      this.grantsController.revoke.bind(this.grantsController),
    );
  }
}
