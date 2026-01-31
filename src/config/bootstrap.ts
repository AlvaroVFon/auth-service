import { connectDB } from './database.config';
import { getStringEnvVariable } from './env.config';
import { startServer } from './app.config';
import { setupGlobalMiddlewares } from './middlewares.config';
import express, { Application } from 'express';
import { initializeUsersModule } from '../users/users.di';
import { HttpInterceptor } from '../common/interceptors/exception.interceptor';

const app: Application = express();

export const bootstrap = async () => {
  const DB_CONNECTION_STRING = getStringEnvVariable('MONGO_URI');
  await connectDB(DB_CONNECTION_STRING);
  startServer(app);
  setupGlobalMiddlewares(app);
  initializeUsersModule(app);
  HttpInterceptor.initialize(app);
};
