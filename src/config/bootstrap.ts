import fs from 'node:fs';

import express, { Application } from 'express';

import { startServer } from './app.config';
import { createApplicationComposition } from './application.composition';
import { BootstrapOverrides } from './bootstrap.interface';
import { provisionOwnerFromEnv } from './owner-provisioning';
import { resolveOwnerCredentials } from './owner.config';

const app: Application = express();

if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

export const composition = createApplicationComposition();

export const bootstrap = async (overrides: BootstrapOverrides = {}) => {
  const logger = overrides.logger ?? composition.logger;
  const db = overrides.database ?? composition.database;
  const expressApp = overrides.app ?? app;
  const listen = overrides.startServer ?? startServer;
  const ownerBootstrap = overrides.ownerBootstrap ?? composition.ownerBootstrap;

  try {
    const ownerCredentials =
      overrides.ownerCredentials === undefined
        ? resolveOwnerCredentials()
        : overrides.ownerCredentials;

    await db.connect();

    await provisionOwnerFromEnv({
      credentials: ownerCredentials,
      ownerBootstrap,
      logger,
    });

    composition.initialize(expressApp, logger);

    return listen(expressApp, logger);
  } catch (error) {
    logger.error('Application bootstrap failed', error);
    process.exit(1);
  }
};
