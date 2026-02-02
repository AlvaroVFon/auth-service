process.loadEnvFile();
import { getStringEnvVariable } from './env.config';
import { Database } from './database.config';
import { startServer } from './app.config';
import { GlobalMiddlewares } from './middlewares.config';
import express, { Application } from 'express';
import { UsersModule } from '../users/users.module';
import { HttpInterceptor } from '../common/interceptors/exception.interceptor';
import { HttpLoggerInterceptor } from '../common/interceptors/httplogger.interceptor';
import { LoggerInterface } from '../libs/logger/logger.interface';
import { WinstonLogger } from '../libs/logger/adapters/winston.logger';
import { CryptoService } from '../libs/crypto/crypto.service';
import { AuthModule } from '../auth/auth.module';
import { JwtService } from '../libs/jwt/jwt.service';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';

const app: Application = express();

const DB_CONNECTION_STRING = getStringEnvVariable('MONGO_URI');
const JWT_SECRET = getStringEnvVariable('JWT_SECRET');
const JWT_EXPIRES_IN = parseInt(
  getStringEnvVariable('JWT_EXPIRES_IN', '3600'),
  10,
);

// Shared instances
const winstonLogger = new WinstonLogger();
const database = new Database(DB_CONNECTION_STRING, winstonLogger);
const cryptoService = new CryptoService();
const jwtService = new JwtService(JWT_SECRET, JWT_EXPIRES_IN);
const authenticationMiddleware = new AuthenticationMiddleware(jwtService);
const authorizationMiddleware = new AuthorizationMiddleware();

// Modules
const usersModule = new UsersModule(
  cryptoService,
  authenticationMiddleware,
  authorizationMiddleware,
  winstonLogger,
);

const authModule = new AuthModule(
  usersModule.service,
  cryptoService,
  jwtService,
  winstonLogger,
);

export const bootstrap = async (logger: LoggerInterface) => {
  try {
    await database.connect();

    HttpLoggerInterceptor.initialize(app, winstonLogger);
    GlobalMiddlewares.initialize(app);

    usersModule.initialize(app);
    authModule.initialize(app);

    HttpInterceptor.initialize(app, winstonLogger);

    startServer(app, winstonLogger);
  } catch (error) {
    logger.error('Application bootstrap failed', error);
    process.exit(1);
  }
};
