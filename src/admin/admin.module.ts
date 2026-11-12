import type { Application } from 'express';

import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import type { LoggerInterface } from '../libs/logger';
import type { AdminController } from './admin.controller';
import { AdminRouter } from './admin.router';

export interface AdminModuleDependencies {
  adminController: AdminController;
  authenticationMiddleware: AuthenticationMiddleware;
  authorizationMiddleware: AuthorizationMiddleware;
  logger: LoggerInterface;
}

export class AdminModule {
  private readonly controller: AdminController;
  private readonly authenticationMiddleware: AuthenticationMiddleware;
  private readonly authorizationMiddleware: AuthorizationMiddleware;
  private readonly logger: LoggerInterface;

  constructor(dependencies: AdminModuleDependencies) {
    this.controller = dependencies.adminController;
    this.authenticationMiddleware = dependencies.authenticationMiddleware;
    this.authorizationMiddleware = dependencies.authorizationMiddleware;
    this.logger = dependencies.logger;
  }

  initialize(app: Application): void {
    new AdminRouter(
      this.authenticationMiddleware,
      this.authorizationMiddleware,
      this.controller,
      app,
    );
    this.logger.info('Init Module - Admin - OK');
  }
}
