import type { Application } from 'express';
import type { Model } from 'mongoose';

import type { ApplicationsPort } from '../applications';
import type { AuditPort } from '../audit';
import { ApplicationAuthorizationMiddleware } from '../common/middlewares/application-authorization.middleware';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { LoggerInterface } from '../libs/logger';
import type { UsersPort } from '../users';
import { GrantsController } from './grants.controller';
import type { Grant } from './grants.interface';
import { GrantsRouter } from './grants.router';
import { GrantsService } from './grants.service';

export class GrantsModule {
  public readonly service: GrantsService;
  private readonly controller: GrantsController;

  constructor(
    grantModel: Model<Grant>,
    private readonly applicationsService: ApplicationsPort,
    usersService: UsersPort,
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    auditService: AuditPort,
    private readonly logger: LoggerInterface,
  ) {
    this.service = new GrantsService(
      grantModel,
      applicationsService,
      usersService,
    );
    this.controller = new GrantsController(this.service, auditService);
  }

  initialize(app: Application): void {
    const applicationAuthorizationMiddleware =
      new ApplicationAuthorizationMiddleware(
        this.service,
        this.applicationsService,
      );

    new GrantsRouter(
      this.authenticationMiddleware,
      applicationAuthorizationMiddleware,
      this.controller,
      app,
    );
    this.logger.info('Init Module - Grants - OK');
  }
}
