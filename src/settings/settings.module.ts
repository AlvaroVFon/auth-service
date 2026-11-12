import type { Application } from 'express';

import type { AuditPort } from '../audit';
import type { RateLimitPolicyResolver } from '../auth/auth.router';
import { assertDependencies } from '../common/depencencies-validator';
import type { ApplicationAuthorizationMiddleware } from '../common/middlewares/application-authorization.middleware';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import type { LoggerInterface } from '../libs/logger';
import { SettingsAdminService } from './settings-admin.service';
import { SettingsController } from './settings.controller';
import type { SettingsPort } from './settings.port';
import { SettingsRouter } from './settings.router';

export interface SettingsModuleDependencies {
  settingsService: SettingsPort;
  auditService?: AuditPort;
  authenticationMiddleware: AuthenticationMiddleware;
  authorizationMiddleware: AuthorizationMiddleware;
  applicationAuthorizationMiddleware: ApplicationAuthorizationMiddleware;
  rateLimitPolicy: RateLimitPolicyResolver;
  logger: LoggerInterface;
}

export class SettingsModule {
  private readonly controller: SettingsController;
  private readonly authenticationMiddleware: AuthenticationMiddleware;
  private readonly authorizationMiddleware: AuthorizationMiddleware;
  private readonly applicationAuthorizationMiddleware: ApplicationAuthorizationMiddleware;
  private readonly rateLimitPolicy: RateLimitPolicyResolver;
  private readonly logger: LoggerInterface;

  constructor(dependencies: SettingsModuleDependencies) {
    assertDependencies(
      {
        settingsService: dependencies.settingsService,
        authenticationMiddleware: dependencies.authenticationMiddleware,
        authorizationMiddleware: dependencies.authorizationMiddleware,
        applicationAuthorizationMiddleware:
          dependencies.applicationAuthorizationMiddleware,
        logger: dependencies.logger,
      },
      this.constructor.name,
    );

    this.controller = new SettingsController(
      new SettingsAdminService(
        dependencies.settingsService,
        dependencies.auditService,
      ),
    );
    this.authenticationMiddleware = dependencies.authenticationMiddleware;
    this.authorizationMiddleware = dependencies.authorizationMiddleware;
    this.applicationAuthorizationMiddleware =
      dependencies.applicationAuthorizationMiddleware;
    this.rateLimitPolicy = dependencies.rateLimitPolicy;
    this.logger = dependencies.logger;
  }

  initialize(app: Application): void {
    new SettingsRouter(
      this.authenticationMiddleware,
      this.authorizationMiddleware,
      this.applicationAuthorizationMiddleware,
      this.controller,
      this.rateLimitPolicy,
      app,
    );
    this.logger.info('Init Module - Settings - OK');
  }
}
