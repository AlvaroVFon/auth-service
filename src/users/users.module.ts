import { User } from './users.schema';
import { CryptoService } from '../libs/crypto/crypto.service';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersRouter } from './users.routes';
import { Application } from 'express';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';

export class UsersModule {
  public readonly service: UsersService;
  public readonly controller: UsersController;

  constructor(
    private readonly cryptoService: CryptoService,
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly authorizationMiddleware: AuthorizationMiddleware,
  ) {
    this.service = new UsersService(User, this.cryptoService);
    this.controller = new UsersController(this.service);
  }

  initialize(app: Application): void {
    new UsersRouter(
      this.authenticationMiddleware,
      this.authorizationMiddleware,
      this.controller,
      app,
    );
  }
}
