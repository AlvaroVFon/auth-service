import { LoggerInterface } from '../../src/libs/logger/logger.interface';

export const silentLogger: LoggerInterface = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
};
