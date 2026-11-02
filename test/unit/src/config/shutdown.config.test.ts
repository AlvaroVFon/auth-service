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

const calls = (loggerMethod: unknown): number =>
  (loggerMethod as { mock: { callCount(): number } }).mock.callCount();

const failingClose = () => {
  throw new Error('close failed');
};

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

    assert.strictEqual(server.close.mock.callCount(), 1);
    assert.strictEqual(database.close.mock.callCount(), 1);
    assert.strictEqual(calls(logger.info), 2);
    assert.strictEqual(calls(logger.error), 0);
  });

  test('should log and exit when the server fails to close', async () => {
    const database = { close: mock.fn(async () => {}) };
    const logger = createLogger();
    const exit = mock.fn();
    const shutdown = createShutdown({
      server: { close: failingClose } as never,
      database: database as never,
      logger,
      exit: exit as never,
    });

    await shutdown('SIGTERM');

    assert.strictEqual(calls(logger.error), 1);
    assert.strictEqual(exit.mock.callCount(), 1);
    assert.strictEqual(exit.mock.calls[0].arguments[0], 1);
    assert.strictEqual(database.close.mock.callCount(), 0);
  });

  test('should log and exit when the database fails to close', async () => {
    const logger = createLogger();
    const exit = mock.fn();
    const shutdown = createShutdown({
      server: { close: (callback: () => void) => callback() } as never,
      database: {
        close: () => Promise.reject(new Error('disconnect failed')),
      } as never,
      logger,
      exit: exit as never,
    });

    await shutdown('SIGTERM');

    assert.strictEqual(calls(logger.error), 1);
    assert.strictEqual(exit.mock.callCount(), 1);
    assert.strictEqual(exit.mock.calls[0].arguments[0], 1);
  });

  test('should log and exit when the server does not close before the timeout', async () => {
    const logger = createLogger();
    const exit = mock.fn();
    const shutdown = createShutdown({
      server: { close: mock.fn() } as never,
      database: { close: mock.fn(async () => {}) } as never,
      logger,
      timeoutMs: 5,
      exit: exit as never,
    });

    await shutdown('SIGTERM');

    assert.strictEqual(calls(logger.error), 1);
    assert.strictEqual(exit.mock.callCount(), 1);
  });

  test('should force an exit when a second signal arrives', async () => {
    const server = { close: mock.fn((callback: () => void) => callback()) };
    const logger = createLogger();
    const exit = mock.fn();
    const shutdown = createShutdown({
      server: server as never,
      database: { close: mock.fn(async () => {}) } as never,
      logger,
      exit: exit as never,
    });

    await shutdown('SIGTERM');
    await shutdown('SIGINT');

    assert.strictEqual(server.close.mock.callCount(), 1);
    assert.strictEqual(calls(logger.warn), 1);
    assert.strictEqual(exit.mock.callCount(), 1);
    assert.strictEqual(exit.mock.calls[0].arguments[0], 1);
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

  test('should swallow and log a failure raised by a registered signal', async () => {
    const handlers: Record<string, () => void> = {};
    const logger = createLogger();

    registerShutdownHandlers(
      {
        server: { close: (callback: () => void) => callback() } as never,
        database: {
          close: () => Promise.reject(new Error('disconnect failed')),
        } as never,
        logger,
        exit: mock.fn() as never,
      },
      {
        on: (event: string, handler: () => void) => {
          handlers[event] = handler;
        },
      } as never,
    );

    handlers['SIGTERM']?.();
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(calls(logger.error), 1);
  });
});
