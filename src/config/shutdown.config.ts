import type { Server } from 'node:http';

import type { LoggerInterface } from '../libs/logger';
import type { Database } from './database.config';

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

export interface ShutdownDependencies {
  server: Pick<Server, 'close'>;
  database: Pick<Database, 'close'>;
  logger: LoggerInterface;
  timeoutMs?: number;
  exit?: (code: number) => void;
}

const closeServer = (
  server: Pick<Server, 'close'>,
  timeoutMs: number,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Server did not close within ${timeoutMs}ms`));
    }, timeoutMs);

    server.close((error?: Error) => {
      clearTimeout(timer);

      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

export const createShutdown = ({
  server,
  database,
  logger,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  exit = (code: number): void => process.exit(code),
}: ShutdownDependencies) => {
  let shuttingDown = false;

  return async (signal: string): Promise<void> => {
    if (shuttingDown) {
      logger.warn(`Received ${signal} while shutting down, forcing exit`);
      exit(1);
      return;
    }

    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down`);

    try {
      await closeServer(server, timeoutMs);
    } catch (error) {
      logger.error('HTTP server did not close gracefully', error);
      exit(1);
      return;
    }

    try {
      await database.close();
    } catch (error) {
      logger.error('Database connection did not close gracefully', error);
      exit(1);
      return;
    }

    logger.info('Shutdown complete');
  };
};

export const registerShutdownHandlers = (
  dependencies: ShutdownDependencies,
  processRef: Pick<NodeJS.Process, 'on'> = process,
): ((signal: string) => Promise<void>) => {
  const shutdown = createShutdown(dependencies);

  const handle = (signal: string): void => {
    void shutdown(signal).catch((error: unknown) => {
      dependencies.logger.error('Shutdown failed', error);
      process.exitCode = 1;
    });
  };

  processRef.on('SIGTERM', () => {
    handle('SIGTERM');
  });
  processRef.on('SIGINT', () => {
    handle('SIGINT');
  });

  return shutdown;
};
