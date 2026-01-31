import { LoggerInterface } from '../../common/interceptors/httplogger.interceptor';
import winston, { Logger } from 'winston';

export class WinstonLogger implements LoggerInterface {
  logger: Logger;

  constructor() {
    this.logger = this.createLogger();
  }

  log(message: string): void {
    this.logger.info(message);
  }
  error(message: string): void {
    this.logger.error(message);
  }
  warn(message: string): void {
    this.logger.warn(message);
  }
  debug(message: string): void {
    this.logger.debug(message);
  }

  createLogger(): Logger {
    return winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize(),
        winston.format.simple(),
      ),
      transports: [new winston.transports.Console()],
    });
  }
}
