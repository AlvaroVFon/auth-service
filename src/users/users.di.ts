import { User } from './users.schema';
import { CryptoService } from '../libs/crypto/crypto.service';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersRouter } from './users.routers';
import { Application } from 'express';

export const initializeUsersModule = (app: Application) => {
  const cryptoService = new CryptoService();
  const usersService = new UsersService(User, cryptoService);
  const usersController = new UsersController(usersService);
  const usersRouter = new UsersRouter(usersController, app);
  return usersRouter.router;
};
