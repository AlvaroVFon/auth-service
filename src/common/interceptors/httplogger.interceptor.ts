import { Application, NextFunction, Request, Response } from 'express';

export interface LoggerInterface {
  log(message: string): void;
  error(message: string): void;
  warn(message: string): void;
  debug(message: string): void;
}

export class HttpLoggerInterceptor {
  constructor(private readonly loggerService: LoggerInterface) {}

  intercept(request: Request, response: Response, next: NextFunction) {
    const start = process.hrtime.bigint();
    const { method, originalUrl } = request;

    response.on('finish', () => {
      const duration = Number(process.hrtime.bigint() - start) / 1_000_000; // Convert to milliseconds
      const { statusCode } = response;
      const logMessage = `${method} ${originalUrl} ${statusCode} - ${duration.toFixed(2)} ms`;

      if (statusCode >= 500) {
        this.loggerService.error(logMessage);
      } else if (statusCode >= 400) {
        this.loggerService.warn(logMessage);
      } else {
        this.loggerService.log(logMessage);
      }
    });

    next();
  }

  static initialize(app: Application, loggerService: LoggerInterface) {
    const interceptor = new HttpLoggerInterceptor(loggerService);
    app.use((req: Request, res: Response, next: NextFunction) => {
      interceptor.intercept(req, res, next);
    });
  }
}
