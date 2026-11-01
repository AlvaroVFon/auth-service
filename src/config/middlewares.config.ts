import express, { Application } from 'express';
import helmet from 'helmet';

import { rateLimiter } from '../common/middlewares/rate-limiter.middleware';
import { RequiredBodyMiddleware } from '../common/middlewares/required-body.middleware';
import { createCorsMiddleware } from './cors.config';

export class GlobalMiddlewares {
  static initialize(
    app: Application,
    excludedBodyPaths: string[] = [],
    corsOrigins: string[] = [],
  ) {
    app.disable('x-powered-by');
    app.use(helmet());
    app.use(createCorsMiddleware(corsOrigins));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(rateLimiter);
    app.use(RequiredBodyMiddleware.create(excludedBodyPaths));
  }
}
