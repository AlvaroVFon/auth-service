import { STATUS_CODES } from 'node:http';

import { Application, Request, Response, NextFunction } from 'express';

import { LoggerInterface } from '../../libs/logger';
import { BaseError } from '../exceptions/base.exception';

export class HttpInterceptor {
  constructor(private readonly app: Application) {
    this.app.use(this.intercept.bind(this));
  }

  private intercept(
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    if (err instanceof BaseError) {
      this.injectErrorDetails(err, req, res);
      return res.status(err.statusCode).json({
        message: err.message,
        code: err.code,
      });
    }

    if (err instanceof Error) {
      const status = this.clientErrorStatus(err);

      if (status !== undefined) {
        return res
          .status(status)
          .json({ message: STATUS_CODES[status] ?? 'Bad Request' });
      }

      return res.status(500).json({
        message: 'Internal Server Error',
      });
    }

    next();
  }

  private clientErrorStatus(error: Error): number | undefined {
    const candidate = error as Error & {
      status?: unknown;
      statusCode?: unknown;
    };
    const status = candidate.status ?? candidate.statusCode;

    if (
      typeof status !== 'number' ||
      !Number.isInteger(status) ||
      status < 400 ||
      status > 499
    ) {
      return undefined;
    }

    return status;
  }

  static initialize(app: Application, logger: LoggerInterface): void {
    new HttpInterceptor(app);
    logger.info('Init Interceptor - Exception - OK');
  }

  injectErrorDetails(error: BaseError, req: Request, res: Response): void {
    const errorMessage = {
      path: req?.originalUrl,
      method: req?.method,
      name: error.name,
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
    };

    res.locals.errorDetails = errorMessage;
  }
}
