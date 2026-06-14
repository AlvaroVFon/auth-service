import { Application } from 'express';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { AuthRouter } from './auth.router';
import { UsersService } from '../users/users.service';
import { CryptoService } from '../libs/crypto/crypto.service';
import { JwtService } from '../libs/jwt/jwt.service';
import { LoggerInterface } from '../libs/logger/logger.interface';
import { MailerInterface } from '../libs/mailer/mailer.interface';
import { CodesService } from './codes/codes.service';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { assertDependencies } from '../common/depencencies-validator';
import { RefreshTokenService } from './tokens/refresh-token.service';
import { HoldersService } from '../holders/holders.service';
import { AuthTenantController } from './controllers/auth.tenant.controller';
import { AuthTenantService } from './services/auth-tenant.service';

export class AuthModule {
  public readonly service: AuthService;
  public readonly controller: AuthController;
  public readonly tenantsController: AuthTenantController;

  constructor(
    private readonly usersService: UsersService,
    private readonly cryptoService: CryptoService,
    private readonly jwtService: JwtService,
    private readonly logger: LoggerInterface,
    private readonly mailService: MailerInterface,
    private readonly codeService: CodesService,
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly holdersService: HoldersService,
    private readonly authTenantService: AuthTenantService,
    private readonly maxLoginAttempts: number,
    private readonly lockoutDurationMs: number,
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
        holdersService,
        authTenantService,
      },
      this.constructor.name,
    );

    this.service = new AuthService(
      this.usersService,
      this.cryptoService,
      this.jwtService,
      this.mailService,
      this.codeService,
      this.refreshTokenService,
      this.holdersService,
      this.maxLoginAttempts,
      this.lockoutDurationMs,
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
    );
    this.logger.info('Init Module - Auth - OK');
  }
}
