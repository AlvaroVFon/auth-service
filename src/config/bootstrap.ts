import { connectDB } from './database.config';
import { getStringEnvVariable } from './env.config';
import { startServer } from './app.config';
import { setupGlobalMiddlewares } from './middlewares.config';
import express, { Application } from 'express';
import { initializeUsersModule } from '../users/users.di';
import { HttpInterceptor } from '../common/interceptors/exception.interceptor';
import { HttpLoggerInterceptor } from '../common/interceptors/httplogger.interceptor';
import { WinstonLogger } from '../libs/logger/winston.logger';

const app: Application = express();

export const bootstrap = async () => {
  const DB_CONNECTION_STRING = getStringEnvVariable('MONGO_URI');
  await connectDB(DB_CONNECTION_STRING);
  HttpLoggerInterceptor.initialize(app, new WinstonLogger());
  setupGlobalMiddlewares(app);
  initializeUsersModule(app);
  HttpInterceptor.initialize(app);
  startServer(app);
};
