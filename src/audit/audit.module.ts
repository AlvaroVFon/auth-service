import type { Application } from 'express';

import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import type { LoggerInterface } from '../libs/logger';
import type { AuditController } from './audit.controller';
import { AuditRouter } from './audit.router';

export interface AuditModuleDependencies {
  auditController: AuditController;
  authenticationMiddleware: AuthenticationMiddleware;
  authorizationMiddleware: AuthorizationMiddleware;
  logger: LoggerInterface;
}

export class AuditModule {
  private readonly controller: AuditController;
  private readonly authenticationMiddleware: AuthenticationMiddleware;
  private readonly authorizationMiddleware: AuthorizationMiddleware;
  private readonly logger: LoggerInterface;

  constructor(dependencies: AuditModuleDependencies) {
    this.controller = dependencies.auditController;
    this.authenticationMiddleware = dependencies.authenticationMiddleware;
    this.authorizationMiddleware = dependencies.authorizationMiddleware;
    this.logger = dependencies.logger;
  }

  initialize(app: Application): void {
    new AuditRouter(
      this.authenticationMiddleware,
      this.authorizationMiddleware,
      this.controller,
      app,
    );
    this.logger.info('Init Module - Audit - OK');
  }
}
