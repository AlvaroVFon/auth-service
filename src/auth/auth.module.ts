import { Application } from 'express';

import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { LoggerInterface } from '../libs/logger';
import { AuthRouter, AuthRateLimitConfig } from './auth.router';
import { AuthController } from './controllers/auth.controller';
import { AuthTenantController } from './controllers/auth.tenant.controller';

export interface AuthModuleDependencies {
  authController: AuthController;
  authTenantController: AuthTenantController;
  authenticationMiddleware: AuthenticationMiddleware;
  rateLimitConfig: AuthRateLimitConfig;
  logger: LoggerInterface;
}

export class AuthModule {
  private readonly controller: AuthController;
  private readonly tenantsController: AuthTenantController;
  private readonly authenticationMiddleware: AuthenticationMiddleware;
  private readonly rateLimitConfig: AuthRateLimitConfig;
  private readonly logger: LoggerInterface;

  constructor(dependencies: AuthModuleDependencies) {
    this.controller = dependencies.authController;
    this.tenantsController = dependencies.authTenantController;
    this.authenticationMiddleware = dependencies.authenticationMiddleware;
    this.rateLimitConfig = dependencies.rateLimitConfig;
    this.logger = dependencies.logger;
  }

  initialize(app: Application): void {
    new AuthRouter(
      this.controller,
      this.tenantsController,
      app,
      this.authenticationMiddleware,
      this.rateLimitConfig,
    );
    this.logger.info('Init Module - Auth - OK');
  }
}
