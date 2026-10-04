import { Application } from 'express';

import { assertDependencies } from '../common/depencencies-validator';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { TokenBlacklistPort } from '../common/ports/token-blacklist.port';
import { HoldersPort } from '../holders';
import { JwtService } from '../libs/jwt';
import { LoggerInterface } from '../libs/logger';
import { UsersPort } from '../users';
import { AuthRouter, AuthRateLimitConfig } from './auth.router';
import { CodesService } from './codes/codes.service';
import { AuthController } from './controllers/auth.controller';
import { AuthTenantController } from './controllers/auth.tenant.controller';
import { AuthMailer } from './services/auth-mailer';
import { AuthTenantService } from './services/auth-tenant.service';
import { AuthService } from './services/auth.service';
import { RefreshTokenService } from './tokens/refresh-token.service';
import { SessionService } from './tokens/session.service';

export class AuthModule {
  private readonly controller: AuthController;
  private readonly tenantsController: AuthTenantController;

  constructor(
    private readonly usersService: UsersPort,
    private readonly jwtService: JwtService,
    private readonly logger: LoggerInterface,
    private readonly authMailer: AuthMailer,
    private readonly codeService: CodesService,
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly blacklistService: TokenBlacklistPort,
    private readonly holdersService: HoldersPort,
    private readonly authTenantService: AuthTenantService,
    private readonly rateLimitConfig: AuthRateLimitConfig,
  ) {
    assertDependencies(
      {
        usersService,
        jwtService,
        logger,
        authMailer,
        codeService,
        authenticationMiddleware,
        refreshTokenService,
        blacklistService,
        holdersService,
        authTenantService,
      },
      this.constructor.name,
    );

    const sessionService = new SessionService(
      this.jwtService,
      this.refreshTokenService,
    );

    const service = new AuthService(
      this.usersService,
      this.authMailer,
      this.codeService,
      sessionService,
      this.blacklistService,
      this.holdersService,
    );
    this.controller = new AuthController(service);
    this.tenantsController = new AuthTenantController(this.authTenantService);
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
