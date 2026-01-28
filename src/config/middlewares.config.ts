import express, { Application } from 'express';

const setupGlobalMiddlewares = (app: Application) => {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
};

export { setupGlobalMiddlewares };
