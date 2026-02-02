import { Application, Request, Response, NextFunction } from 'express';
import { BaseError } from '../exceptions/base.exception';
import { LoggerInterface } from '../../libs/logger/logger.interface';

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
      return res.status(500).json({
        message: 'Internal Server Error',
      });
    }

    next();
  }

  static initialize(app: Application, logger: LoggerInterface): void {
    new HttpInterceptor(app);
    logger.log('Init Interceptor - Exception - OK');
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
