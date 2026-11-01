import type { Server } from 'node:http';

import type { LoggerInterface } from '../libs/logger';
import type { Database } from './database.config';

export interface ShutdownDependencies {
  server: Pick<Server, 'close'>;
  database: Pick<Database, 'close'>;
  logger: LoggerInterface;
}

export const createShutdown = ({
  server,
  database,
  logger,
}: ShutdownDependencies) => {
  let shuttingDown = false;

  return async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down`);

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    await database.close();
    logger.info('Shutdown complete');
  };
};

export const registerShutdownHandlers = (
  dependencies: ShutdownDependencies,
  processRef: Pick<NodeJS.Process, 'on'> = process,
): ((signal: string) => Promise<void>) => {
  const shutdown = createShutdown(dependencies);

  processRef.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  processRef.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  return shutdown;
};
