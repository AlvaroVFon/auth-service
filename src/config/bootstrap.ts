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

const app: Application = express();

const DB_CONNECTION_STRING = getStringEnvVariable('MONGO_URI');

// Shared instances
const winstonLogger = new WinstonLogger();
const database = new Database(DB_CONNECTION_STRING, winstonLogger);

// Modules
const usersModule = new UsersModule(new CryptoService());

export const bootstrap = async () => {
  await database.connect();
  HttpLoggerInterceptor.initialize(app, winstonLogger);
  GlobalMiddlewares.initialize(app);
  usersModule.initialize(app);
  HttpInterceptor.initialize(app);
  startServer(app, winstonLogger);
};
