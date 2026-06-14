import express, { Application } from 'express';
import { RequiredBodyMiddleware } from '../common/middlewares/required-body.middleware';
import { rateLimiter } from '../common/middlewares/rate-limiter.middleware';

export class GlobalMiddlewares {
  static initialize(app: Application) {
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(rateLimiter);
    app.use(RequiredBodyMiddleware.initialize);
  }
}
