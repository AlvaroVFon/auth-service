import { Application } from 'express';

import { LoggerInterface } from '../libs/logger';

export interface BootstrapOverrides {
  logger?: LoggerInterface;
  database?: { connect(): Promise<void> };
  app?: Application;
  startServer?: (
    app: Application,
    logger: LoggerInterface,
  ) => { close?: (callback?: (err?: Error) => void) => unknown };
}
