import type { Application } from 'express';

import type { ApplicationAuthorizationMiddleware } from '../common/middlewares/application-authorization.middleware';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import type { LoggerInterface } from '../libs/logger';
import type { LinksController } from './links.controller';
import { LinksRouter } from './links.router';

export interface LinksModuleDependencies {
  linksController: LinksController;
  authenticationMiddleware: AuthenticationMiddleware;
  authorizationMiddleware: AuthorizationMiddleware;
  logger: LoggerInterface;
}

export class LinksModule {
  private readonly controller: LinksController;
  private readonly authenticationMiddleware: AuthenticationMiddleware;
  private readonly authorizationMiddleware: AuthorizationMiddleware;
  private readonly logger: LoggerInterface;

  constructor(dependencies: LinksModuleDependencies) {
    this.controller = dependencies.linksController;
    this.authenticationMiddleware = dependencies.authenticationMiddleware;
    this.authorizationMiddleware = dependencies.authorizationMiddleware;
    this.logger = dependencies.logger;
  }

  initialize(
    app: Application,
    applicationAuthorizationMiddleware: ApplicationAuthorizationMiddleware,
  ): void {
    new LinksRouter(
      this.authenticationMiddleware,
      applicationAuthorizationMiddleware,
      this.authorizationMiddleware,
      this.controller,
      app,
    );
    this.logger.info('Init Module - Links - OK');
  }
}
