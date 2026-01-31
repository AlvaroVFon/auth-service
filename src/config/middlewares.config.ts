import express, { Application } from 'express';
import { RequiredBodyMiddleware } from '../common/middlewares/required-body.middleware';

export class GlobalMiddlewares {
  static initialize(app: Application) {
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(RequiredBodyMiddleware.initialize);
  }
}
