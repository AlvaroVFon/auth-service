import { LoggerInterface } from '../logger.interface';
import winston, { Logger } from 'winston';

export class WinstonLogger implements LoggerInterface {
  logger: Logger;

  constructor() {
    this.logger = this.createLogger();
  }

  log(message: string): void {
    this.logger.info(message);
  }
  error(message: string, error?: Error) {
    return error
      ? this.logger.error(message, error)
      : this.logger.error(message);
  }
  warn(message: string, warning?: Error) {
    return warning
      ? this.logger.warn(message, warning)
      : this.logger.warn(message);
  }
  debug(message: string, debug?: Error) {
    return debug
      ? this.logger.debug(message, debug)
      : this.logger.debug(message);
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
