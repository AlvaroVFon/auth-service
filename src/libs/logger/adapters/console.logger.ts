import { LoggerInterface } from '../logger.interface';

export class ConsoleLogger implements LoggerInterface {
  log(message: string): void {
    console.log(message);
  }
  info(message: string): void {
    console.info(message);
  }
  error(message: string, error?: Error): void {
    return error ? console.error(message, error) : console.error(message);
  }
  warn(message: string, warning?: Error): void {
    return warning ? console.warn(message, warning) : console.warn(message);
  }
  debug(message: string, debug?: Error): void {
    return debug ? console.debug(message, debug) : console.debug(message);
  }
}
