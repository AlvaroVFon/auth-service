import { Application } from 'express';

import { assertDependencies } from '../common/depencencies-validator';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { HoldersPort } from '../holders';
import { CryptoService } from '../libs/crypto';
import { JwtService } from '../libs/jwt';
import { LoggerInterface } from '../libs/logger';
import { MailerInterface } from '../libs/mailer';
import { UsersPort } from '../users';
import { AuthRouter, AuthRateLimitConfig } from './auth.router';
import { CodesService } from './codes/codes.service';
import { AuthController } from './controllers/auth.controller';
import { AuthTenantController } from './controllers/auth.tenant.controller';
import { AuthTenantService } from './services/auth-tenant.service';
import { AuthService } from './services/auth.service';
import { BlacklistService } from './tokens/blacklist.service';
import { RefreshTokenService } from './tokens/refresh-token.service';
import { SessionService } from './tokens/session.service';

export class AuthModule {
  public readonly service: AuthService;
  public readonly controller: AuthController;
  public readonly tenantsController: AuthTenantController;

  constructor(
    private readonly usersService: UsersPort,
    private readonly cryptoService: CryptoService,
    private readonly jwtService: JwtService,
    private readonly logger: LoggerInterface,
    private readonly mailService: MailerInterface,
    private readonly codeService: CodesService,
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly blacklistService: BlacklistService,
    private readonly holdersService: HoldersPort,
    private readonly authTenantService: AuthTenantService,
    private readonly maxLoginAttempts: number,
    private readonly lockoutDurationMs: number,
    private readonly rateLimitConfig: AuthRateLimitConfig,
    private readonly publicAppUrl: string = 'https://ourservice.com',
  ) {
    assertDependencies(
      {
        usersService,
        cryptoService,
        jwtService,
        logger,
        mailService,
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

    this.service = new AuthService(
      this.usersService,
      this.cryptoService,
      this.mailService,
      this.codeService,
      sessionService,
      this.blacklistService,
      this.holdersService,
      this.maxLoginAttempts,
      this.lockoutDurationMs,
      this.publicAppUrl,
    );
    this.controller = new AuthController(this.service);
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
