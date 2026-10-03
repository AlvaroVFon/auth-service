import { Server } from 'node:http';

import { Application } from 'express';
import express from 'express';
import request from 'supertest';

import { bootstrap } from '../../../../src/config/bootstrap';
import { LoggerInterface } from '../../../../src/libs/logger/logger.interface';

const createLogger = (): LoggerInterface => ({
  info: mock.fn(),
  error: mock.fn(),
  warn: mock.fn(),
  debug: mock.fn(),
});

const createDatabase = (connect: () => Promise<void>) => ({ connect });

describe('bootstrap', () => {
  let logger: LoggerInterface;
  let app: Application;

  beforeEach(() => {
    logger = createLogger();
    app = express();
    app.set('trust proxy', 1);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  test('should wire every module onto the app without requiring a real server', async () => {
    const connect = mock.fn(async () => {});
    const startServer = mock.fn(() => ({ close: () => {} }));

    const server = await bootstrap({
      logger,
      app,
      database: createDatabase(connect),
      startServer: startServer as any,
    });

    assert.ok(server);
    assert.strictEqual(connect.mock.callCount(), 1);
    assert.strictEqual(startServer.mock.callCount(), 1);
    assert.strictEqual(startServer.mock.calls[0]?.arguments[0], app);
    assert.strictEqual(startServer.mock.calls[0]?.arguments[1], logger);

    const wrongMethod = await request(app).get('/definitely-not-a-route');
    assert.strictEqual(wrongMethod.status, 404);
  });

  test('should wire module routes onto the app', async () => {
    await bootstrap({
      logger,
      app,
      database: createDatabase(async () => {}),
      startServer: (() => ({ close: () => {} })) as any,
    });

    const found = await request(app)
      .post('/auth/login')
      .send({ email: 'attempt' });

    assert.notStrictEqual(found.status, 404);
  });

  test('should serve health of a wired route end-to-end', async () => {
    await bootstrap({
      logger,
      app,
      database: createDatabase(async () => {}),
      startServer: (() => ({ close: () => {} })) as any,
    });

    const response = await request(app)
      .get('/users')
      .set('Authorization', 'Bearer not-a-token')
      .expect(401);

    assert.ok(response.body);
  });

  test('should log and exit when the database connection fails', async () => {
    const exit = mock.method(process, 'exit', (() => {
      throw new Error('process.exit');
    }) as any);

    const failure = new Error('mongo unreachable');

    await assert.rejects(
      bootstrap({
        logger,
        app,
        database: createDatabase(async () => {
          throw failure;
        }),
        startServer: (() => ({ close: () => {} })) as any,
      }),
      /process\.exit/,
    );

    assert.strictEqual(exit.mock.callCount(), 1);
    assert.strictEqual(
      (
        logger.error as unknown as { mock: { callCount(): number } }
      ).mock.callCount(),
      1,
    );
    assert.deepStrictEqual(
      (
        logger.error as unknown as {
          mock: { calls: { arguments: unknown[] }[] };
        }
      ).mock.calls[0]?.arguments,
      ['Application bootstrap failed', failure],
    );
  });

  test('should not start the server when wiring throws', async () => {
    mock.method(process, 'exit', (() => {
      throw new Error('process.exit');
    }) as any);
    const startServer = mock.fn(() => ({ close: () => {} }));

    await assert.rejects(
      bootstrap({
        logger,
        app,
        database: createDatabase(async () => {
          throw new Error('db down');
        }),
        startServer: startServer as any,
      }),
      /process\.exit/,
    );

    assert.strictEqual(startServer.mock.callCount(), 0);
  });

  test('should return a running server by default when the app is real', async () => {
    const server = (await bootstrap({
      logger,
      app,
      database: createDatabase(async () => {}),
    })) as Server;

    await new Promise<void>((resolve) => {
      if (server.listening) return resolve();
      server.once('listening', () => resolve());
    });

    assert.ok(server.listening);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
