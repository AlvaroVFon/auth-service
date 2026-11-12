import type { Application } from 'express';

import { Roles } from '../common/enums/roles.enum';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import type { AdminController } from './admin.controller';

export class AdminRouter {
  constructor(
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly authorizationMiddleware: AuthorizationMiddleware,
    private readonly controller: AdminController,
    private readonly app: Application,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.app.get(
      '/admin/overview',
      this.authenticationMiddleware.authenticateAny,
      this.authorizationMiddleware.allowRoles(Roles.OWNER),
      this.controller.getOverview.bind(this.controller),
    );
  }
}
