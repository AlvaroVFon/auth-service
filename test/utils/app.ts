import express, { Application } from 'express';
import { setupGlobalMiddlewares } from '../../src/config/middlewares.config';
import { setupRoutes } from '../../src/config/routes.config';

let app: Application;

export const createAppTestInstance = async () => {
  app = express();
  setupGlobalMiddlewares(app);
  setupRoutes(app);
  return app;
};

export const getTestAppInstance = async () => {
  if (!app) {
    await createAppTestInstance();
  }
  return app;
};
