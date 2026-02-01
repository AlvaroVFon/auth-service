process.loadEnvFile();
import { getStringEnvVariable } from './env.config';
import { Database } from './database.config';
import { startServer } from './app.config';
import { GlobalMiddlewares } from './middlewares.config';
import express, { Application } from 'express';
import { UsersModule } from '../users/users.module';
import { HttpInterceptor } from '../common/interceptors/exception.interceptor';
import { HttpLoggerInterceptor } from '../common/interceptors/httplogger.interceptor';
import { WinstonLogger } from '../libs/logger/winston.logger';
import { CryptoService } from '../libs/crypto/crypto.service';
import { AuthModule } from '../auth/auth.module';
import { JwtService } from '../libs/jwt/jwt.service';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';

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

// Modules
const usersModule = new UsersModule(cryptoService, authenticationMiddleware);
const authModule = new AuthModule(
  usersModule.service,
  cryptoService,
  jwtService,
);

export const bootstrap = async () => {
  await database.connect();
  HttpLoggerInterceptor.initialize(app, winstonLogger);
  GlobalMiddlewares.initialize(app);
  usersModule.initialize(app);
  authModule.initialize(app);
  HttpInterceptor.initialize(app);
  startServer(app, winstonLogger);
};
