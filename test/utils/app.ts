import express, { Application } from 'express';
import { setupGlobalMiddlewares } from '../../src/config/middlewares.config';
import { initializeUsersModule } from '../../src/users/users.di';
import { HttpInterceptor } from '../../src/common/interceptors/exception.interceptor';

let app: Application;

export const createAppTestInstance = async () => {
  app = express();
  setupGlobalMiddlewares(app);
  initializeUsersModule(app);
  HttpInterceptor.initialize(app);
  return app;
};

export const getTestAppInstance = async () => {
  if (!app) {
    await createAppTestInstance();
  }
  return app;
};
