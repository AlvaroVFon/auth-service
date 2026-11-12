import type { Application } from 'express';
import type { Model } from 'mongoose';

import type { ApplicationsPort } from '../applications';
import type { AuditPort } from '../audit';
import type { RateLimitPolicyResolver } from '../auth/auth.router';
import type { ApplicationAuthorizationMiddleware } from '../common/middlewares/application-authorization.middleware';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { LoggerInterface } from '../libs/logger';
import type { UsersPort } from '../users';
import { GrantsController } from './grants.controller';
import type { Grant } from './grants.interface';
import { GrantsRouter, type GrantsRateLimitConfig } from './grants.router';
import { GrantsService } from './grants.service';

export class GrantsModule {
  public readonly service: GrantsService;
  private readonly controller: GrantsController;

  constructor(
    grantModel: Model<Grant>,
    applicationsService: ApplicationsPort,
    usersService: UsersPort,
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    auditService: AuditPort,
    private readonly logger: LoggerInterface,
    private readonly rateLimitConfig: GrantsRateLimitConfig,
    private readonly rateLimitPolicy: RateLimitPolicyResolver,
  ) {
    this.service = new GrantsService(
      grantModel,
      applicationsService,
      usersService,
      auditService,
    );
    this.controller = new GrantsController(this.service);
  }

  initialize(
    app: Application,
    applicationAuthorizationMiddleware: ApplicationAuthorizationMiddleware,
  ): void {
    new GrantsRouter(
      this.authenticationMiddleware,
      applicationAuthorizationMiddleware,
      this.controller,
      this.rateLimitConfig,
      this.rateLimitPolicy,
      app,
    );
    this.logger.info('Init Module - Grants - OK');
  }
}
