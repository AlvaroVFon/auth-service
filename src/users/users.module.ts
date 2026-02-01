import { User } from './users.schema';
import { CryptoService } from '../libs/crypto/crypto.service';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersRouter } from './users.routers';
import { Application } from 'express';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';

export class UsersModule {
  public readonly service: UsersService;
  public readonly controller: UsersController;

  constructor(
    private readonly cryptoService: CryptoService,
    private readonly authenticationMiddleware: AuthenticationMiddleware,
  ) {
    this.service = new UsersService(User, this.cryptoService);
    this.controller = new UsersController(this.service);
  }

  initialize(app: Application): void {
    new UsersRouter(this.authenticationMiddleware, this.controller, app);
  }
}
