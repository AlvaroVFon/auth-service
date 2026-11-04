import type { Application } from 'express';

import { Roles } from '../common/enums/roles.enum';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import type { ApplicationsController } from './applications.controller';

export class ApplicationsRouter {
  constructor(
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly authorizationMiddleware: AuthorizationMiddleware,
    private readonly applicationsController: ApplicationsController,
    private readonly app: Application,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    const ownerOnly = [
      this.authenticationMiddleware.authenticate,
      this.authorizationMiddleware.allowRoles(Roles.OWNER),
    ];

    this.app.post(
      '/applications',
      ...ownerOnly,
      this.applicationsController.create.bind(this.applicationsController),
    );

    this.app.get(
      '/applications',
      ...ownerOnly,
      this.applicationsController.findAll.bind(this.applicationsController),
    );

    this.app.get(
      '/applications/:id',
      ...ownerOnly,
      this.applicationsController.findById.bind(this.applicationsController),
    );

    this.app.patch(
      '/applications/:id',
      ...ownerOnly,
      this.applicationsController.update.bind(this.applicationsController),
    );

    this.app.delete(
      '/applications/:id',
      ...ownerOnly,
      this.applicationsController.archive.bind(this.applicationsController),
    );
  }
}
