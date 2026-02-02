import { Application, NextFunction, Request, Response } from 'express';
import { LoggerInterface } from '../../libs/logger/logger.interface';

export class HttpLoggerInterceptor {
  constructor(private readonly logger: LoggerInterface) {}

  intercept(request: Request, response: Response, next: NextFunction) {
    const start = process.hrtime.bigint();
    const { method, originalUrl, headers } = request;

    response.on('finish', () => {
      const duration = Number(process.hrtime.bigint() - start) / 1_000_000; // Convert to milliseconds
      const { statusCode } = response;
      let logMessage: string;

      if (response.locals.errorDetails) {
        logMessage = JSON.stringify({
          ...response.locals.errorDetails,
          duration: `${duration.toFixed(2)} ms`,
          headers, // TODO: sanitize headers to avoid logging sensitive info
        });
      } else {
        logMessage = `${method} ${originalUrl} ${statusCode} - ${duration.toFixed(2)} ms`;
      }

      if (statusCode >= 500) {
        this.logger.error(logMessage);
      } else if (statusCode >= 400) {
        this.logger.warn(logMessage);
      } else {
        this.logger.log(logMessage);
      }
    });

    next();
  }

  static initialize(app: Application, logger: LoggerInterface) {
    const interceptor = new HttpLoggerInterceptor(logger);
    app.use((req: Request, res: Response, next: NextFunction) => {
      interceptor.intercept(req, res, next);
    });
  }
}
