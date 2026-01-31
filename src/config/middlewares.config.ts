import express, { Application } from 'express';
import { RequiredBodyMiddleware } from '../common/middlewares/required-body.middleware';

const setupGlobalMiddlewares = (app: Application) => {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(RequiredBodyMiddleware.initialize);
};

export { setupGlobalMiddlewares };
