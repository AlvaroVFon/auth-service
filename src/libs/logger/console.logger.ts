import { Logger } from '../../common/interceptors/httplogger.interceptor';

export class ConsoleLogger implements Logger {
  log(message: string): void {
    console.log(message);
  }
  info(message: string): void {
    console.info(message);
  }
  error(message: string): void {
    console.error(message);
  }
  warn(message: string): void {
    console.warn(message);
  }
  debug(message: string): void {
    console.debug(message);
  }
}
