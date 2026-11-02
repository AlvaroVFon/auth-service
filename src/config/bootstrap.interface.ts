import { Application } from 'express';

import { LoggerInterface } from '../libs/logger';
import { OwnerProvisioner } from './owner-provisioning';
import { OwnerCredentials } from './owner.config';

export interface BootstrapOverrides {
  logger?: LoggerInterface;
  database?: { connect(): Promise<void> };
  app?: Application;
  startServer?: (
    app: Application,
    logger: LoggerInterface,
  ) => { close?: (callback?: (err?: Error) => void) => unknown };
  ownerBootstrap?: OwnerProvisioner;
  ownerCredentials?: OwnerCredentials | null;
}
