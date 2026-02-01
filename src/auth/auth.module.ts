import { Application } from 'express';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthRouter } from './auth.router';
import { UsersService } from '../users/users.service';
import { CryptoService } from '../libs/crypto/crypto.service';
import { JwtService } from '../libs/jwt/jwt.service';

export class AuthModule {
  public readonly service: AuthService;
  public readonly controller: AuthController;

  constructor(
    private readonly usersService: UsersService,
    private readonly cryptoService: CryptoService,
    private readonly jwtService: JwtService,
  ) {
    this.service = new AuthService(
      this.usersService,
      this.cryptoService,
      this.jwtService,
    );
    this.controller = new AuthController(this.service);
  }

  initialize(app: Application): void {
    new AuthRouter(this.controller, app);
  }
}
