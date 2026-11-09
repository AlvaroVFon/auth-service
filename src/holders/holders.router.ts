import type { Application } from 'express';

import { Roles } from '../common/enums/roles.enum';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import type { HoldersController } from './holders.controller';

export class HoldersRouter {
  constructor(
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly authorizationMiddleware: AuthorizationMiddleware,
    private readonly controller: HoldersController,
    private readonly app: Application,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.app.get(
      '/holders',
      this.authenticationMiddleware.authenticate,
      this.authorizationMiddleware.allowRoles(Roles.OWNER),
      this.controller.list.bind(this.controller),
    );
  }
}
