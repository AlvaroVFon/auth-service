import { connectDB } from './database.config';
import { getStringEnvVariable } from './env.config';
import { startServer } from './app.config';
import { setupGlobalMiddlewares } from './middlewares.config';
import { setupRoutes } from './routes.config';
import express, { Application } from 'express';

const app: Application = express();

export const bootstrap = async () => {
  const DB_CONNECTION_STRING = getStringEnvVariable('MONGO_URI');
  await connectDB(DB_CONNECTION_STRING);
  startServer(app);
  setupGlobalMiddlewares(app);
  setupRoutes(app);
};
