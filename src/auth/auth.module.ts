import { Application } from 'express';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthRouter } from './auth.router';
import { UsersService } from '../users/users.service';
import { CryptoService } from '../libs/crypto/crypto.service';
import { JwtService } from '../libs/jwt/jwt.service';
import { LoggerInterface } from '../libs/logger/logger.interface';
import { MailerInterface } from '../libs/mailer/mailer.interface';
import { CodesService } from './codes/codes.service';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { assertDependencies } from '../common/depencencies-validator';

export class AuthModule {
  public readonly service: AuthService;
  public readonly controller: AuthController;

  constructor(
    private readonly usersService: UsersService,
    private readonly cryptoService: CryptoService,
    private readonly jwtService: JwtService,
    private readonly logger: LoggerInterface,
    private readonly mailService: MailerInterface,
    private readonly codeService: CodesService,
    private readonly authenticationMiddleware: AuthenticationMiddleware,
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
      },
      this.constructor.name,
    );

    this.service = new AuthService(
      this.usersService,
      this.cryptoService,
      this.jwtService,
      this.mailService,
      this.codeService,
    );
    this.controller = new AuthController(this.service);
  }

  initialize(app: Application): void {
    new AuthRouter(this.controller, app, this.authenticationMiddleware);
    this.logger.info('Init Module - Auth - OK');
  }
}
