import { Application } from 'express';

import type { ApplicationsPort } from '../applications';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { JwtService } from '../libs/jwt';
import { LoggerInterface } from '../libs/logger';
import {
  AuthRouter,
  AuthRateLimitConfig,
  RateLimitPolicyResolver,
} from './auth.router';
import { AuthController } from './controllers/auth.controller';

export interface AuthModuleDependencies {
  authController: AuthController;
  authenticationMiddleware: AuthenticationMiddleware;
  rateLimitConfig: AuthRateLimitConfig;
  rateLimitPolicy: RateLimitPolicyResolver;
  applicationsService: ApplicationsPort;
  jwtService: JwtService;
  logger: LoggerInterface;
}

export class AuthModule {
  private readonly controller: AuthController;
  private readonly authenticationMiddleware: AuthenticationMiddleware;
  private readonly rateLimitConfig: AuthRateLimitConfig;
  private readonly rateLimitPolicy: RateLimitPolicyResolver;
  private readonly applicationsService: ApplicationsPort;
  private readonly jwtService: JwtService;
  private readonly logger: LoggerInterface;

  constructor(dependencies: AuthModuleDependencies) {
    this.controller = dependencies.authController;
    this.authenticationMiddleware = dependencies.authenticationMiddleware;
    this.rateLimitConfig = dependencies.rateLimitConfig;
    this.rateLimitPolicy = dependencies.rateLimitPolicy;
    this.applicationsService = dependencies.applicationsService;
    this.jwtService = dependencies.jwtService;
    this.logger = dependencies.logger;
  }

  initialize(app: Application): void {
    new AuthRouter(
      this.controller,
      app,
      this.authenticationMiddleware,
      this.rateLimitConfig,
      this.rateLimitPolicy,
      this.applicationsService,
      this.jwtService,
    );
    this.logger.info('Init Module - Auth - OK');
  }
}
