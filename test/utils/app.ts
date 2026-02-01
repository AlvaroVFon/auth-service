import express, { Application } from 'express';
import { GlobalMiddlewares } from '../../src/config/middlewares.config';
import { UsersModule } from '../../src/users/users.module';
import { HttpInterceptor } from '../../src/common/interceptors/exception.interceptor';
import { HttpLoggerInterceptor } from '../../src/common/interceptors/httplogger.interceptor';
import { WinstonLogger } from '../../src/libs/logger/winston.logger';
import { CryptoService } from '../../src/libs/crypto/crypto.service';
import { getStringEnvVariable } from '../../src/config/env.config';
import { JwtService } from '../../src/libs/jwt/jwt.service';
import { AuthModule } from '../../src/auth/auth.module';

let app: Application;

const JWT_SECRET = getStringEnvVariable('JWT_SECRET');
const JWT_EXPIRES_IN = parseInt(
  getStringEnvVariable('JWT_EXPIRES_IN', '3600'),
  10,
);

const winstonLogger = new WinstonLogger();
const cryptoService = new CryptoService();
const jwtService = new JwtService(JWT_SECRET, JWT_EXPIRES_IN);

const usersModule = new UsersModule(cryptoService);
const authModule = new AuthModule(
  usersModule.service,
  cryptoService,
  jwtService,
);

export const createAppTestInstance = async () => {
  app = express();
  HttpLoggerInterceptor.initialize(app, winstonLogger);
  GlobalMiddlewares.initialize(app);
  usersModule.initialize(app);
  authModule.initialize(app);
  HttpInterceptor.initialize(app);
  return app;
};

export const getTestAppInstance = async () => {
  if (!app) {
    await createAppTestInstance();
  }
  return app;
};
