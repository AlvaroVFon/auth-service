export interface LoggerInterface {
  log(message: string): void;
  error(message: string, error?: Error | unknown): void;
  warn(message: string, error?: Error | unknown): void;
  debug(message: string, error?: Error | unknown): void;
}
