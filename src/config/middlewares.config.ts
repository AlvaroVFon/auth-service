import express, { Application } from 'express';
import helmet from 'helmet';

import {
  createRateLimiter,
  DEFAULT_RATE_LIMIT_MESSAGE,
  GLOBAL_RATE_LIMIT_MAX,
  GLOBAL_RATE_LIMIT_WINDOW_MS,
} from '../common/middlewares/rate-limiter.middleware';
import {
  RequiredBodyMiddleware,
  type BodylessPath,
} from '../common/middlewares/required-body.middleware';
import { isHealthProbe } from '../health';
import { createCorsMiddleware } from './cors.config';

export class GlobalMiddlewares {
  static initialize(
    app: Application,
    excludedBodyPaths: BodylessPath[] = [],
    corsOrigins: string[] = [],
  ) {
    app.use(helmet());
    app.use(createCorsMiddleware(corsOrigins));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(
      createRateLimiter(
        GLOBAL_RATE_LIMIT_WINDOW_MS,
        GLOBAL_RATE_LIMIT_MAX,
        DEFAULT_RATE_LIMIT_MESSAGE,
        (request) => isHealthProbe(request.path),
      ),
    );
    app.use(RequiredBodyMiddleware.create(excludedBodyPaths));
  }
}
