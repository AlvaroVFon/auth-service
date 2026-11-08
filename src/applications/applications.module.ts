import type { Application } from 'express';

import type { AuditPort } from '../audit';
import type { ApplicationAuthorizationMiddleware } from '../common/middlewares/application-authorization.middleware';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import type { LoggerInterface } from '../libs/logger';
import { ApplicationsController } from './applications.controller';
import { ApplicationsRouter } from './applications.router';
import { ApplicationModel } from './applications.schema';
import { ApplicationsService } from './applications.service';

export class ApplicationsModule {
  public readonly service: ApplicationsService;
  private readonly controller: ApplicationsController;

  constructor(
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly authorizationMiddleware: AuthorizationMiddleware,
    private readonly logger: LoggerInterface,
    auditService?: AuditPort,
  ) {
    this.service = new ApplicationsService(ApplicationModel, auditService);
    this.controller = new ApplicationsController(this.service);
  }

  initialize(
    app: Application,
    applicationAuthorizationMiddleware: ApplicationAuthorizationMiddleware,
  ): void {
    new ApplicationsRouter(
      this.authenticationMiddleware,
      this.authorizationMiddleware,
      applicationAuthorizationMiddleware,
      this.controller,
      app,
    );
    this.logger.info('Init Module - Applications - OK');
  }
}
