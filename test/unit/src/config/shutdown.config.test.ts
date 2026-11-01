import {
  createShutdown,
  registerShutdownHandlers,
} from '../../../../src/config/shutdown.config';
import { LoggerInterface } from '../../../../src/libs/logger/logger.interface';

const createLogger = (): LoggerInterface => ({
  info: mock.fn(),
  error: mock.fn(),
  warn: mock.fn(),
  debug: mock.fn(),
});

describe('shutdown', () => {
  test('should close the server and the database once', async () => {
    const server = { close: mock.fn((callback: () => void) => callback()) };
    const database = { close: mock.fn(async () => {}) };
    const logger = createLogger();
    const shutdown = createShutdown({
      server: server as never,
      database: database as never,
      logger,
    });

    await shutdown('SIGTERM');
    await shutdown('SIGINT');

    assert.strictEqual(server.close.mock.callCount(), 1);
    assert.strictEqual(database.close.mock.callCount(), 1);
    assert.strictEqual(
      (
        logger.info as unknown as { mock: { callCount(): number } }
      ).mock.callCount(),
      2,
    );
  });

  test('should register handlers for SIGTERM and SIGINT', () => {
    const handlers: Record<string, () => void> = {};
    const processRef = {
      on: (event: string, handler: () => void) => {
        handlers[event] = handler;
      },
    };

    registerShutdownHandlers(
      {
        server: { close: mock.fn() } as never,
        database: { close: mock.fn(async () => {}) } as never,
        logger: createLogger(),
      },
      processRef as never,
    );

    assert.ok(handlers['SIGTERM']);
    assert.ok(handlers['SIGINT']);
  });
});
