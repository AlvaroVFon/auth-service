import express, { Application } from 'express';
import { GlobalMiddlewares } from '../../src/config/middlewares.config';
import { UsersModule } from '../../src/users/users.module';
import { HttpInterceptor } from '../../src/common/interceptors/exception.interceptor';
import { HttpLoggerInterceptor } from '../../src/common/interceptors/httplogger.interceptor';
import { WinstonLogger } from '../../src/libs/logger/winston.logger';
import { CryptoService } from '../../src/libs/crypto/crypto.service';

let app: Application;

const winstonLogger = new WinstonLogger();
const cryptoService = new CryptoService();

const usersModule = new UsersModule(cryptoService);

export const createAppTestInstance = async () => {
  app = express();
  HttpLoggerInterceptor.initialize(app, winstonLogger);
  GlobalMiddlewares.initialize(app);
  usersModule.initialize(app);
  HttpInterceptor.initialize(app);
  return app;
};

export const getTestAppInstance = async () => {
  if (!app) {
    await createAppTestInstance();
  }
  return app;
};
