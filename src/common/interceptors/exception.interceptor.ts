import { Application, Request, Response, NextFunction } from 'express';
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
      //TODO: Add logging here
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

  static initialize(app: Application) {
    new HttpInterceptor(app);
  }
}
