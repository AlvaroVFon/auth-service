import fs from 'node:fs';

import express, { Application } from 'express';

import { startServer } from './app.config';
import { createApplicationComposition } from './application.composition';
import { BootstrapOverrides } from './bootstrap.interface';

const app: Application = express();

if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

const composition = createApplicationComposition();

export const bootstrap = async (overrides: BootstrapOverrides = {}) => {
  const logger = overrides.logger ?? composition.logger;
  const db = overrides.database ?? composition.database;
  const expressApp = overrides.app ?? app;
  const listen = overrides.startServer ?? startServer;

  try {
    await db.connect();

    composition.initialize(expressApp, logger);

    return listen(expressApp, logger);
  } catch (error) {
    logger.error('Application bootstrap failed', error);
    process.exit(1);
  }
};
