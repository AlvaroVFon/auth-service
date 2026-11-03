import mongoose from 'mongoose';

import { InfraError } from '../../../../src/common/exceptions/infra.exceptions';
import {
  Database,
  redactCredentials,
} from '../../../../src/config/database.config';
import type { LoggerInterface } from '../../../../src/libs/logger/logger.interface';
import { silentLogger } from '../../../mocks/logger.mock';

const UNREACHABLE =
  'mongodb://127.0.0.1:1/unreachable?serverSelectionTimeoutMS=100&connectTimeoutMS=100';

const createLogger = () => ({
  info: mock.fn(),
  warn: mock.fn(),
  error: mock.fn(),
  debug: mock.fn(),
});

const captureError = async (database: Database): Promise<unknown> =>
  database.connect().then(
    () => null,
    (rejection: unknown) => rejection,
  );

describe('Database.connect error reporting', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  test('should preserve the underlying driver error as cause', async () => {
    const database = new Database(UNREACHABLE, silentLogger);

    const error = (await captureError(database)) as InfraError;

    assert.ok(error instanceof InfraError);
    assert.strictEqual(error.message, 'Database connection failed');
    assert.ok(error.cause, 'the driver error must be preserved as cause');
    assert.ok(error.cause instanceof Error);
  });

  test('should log a sanitized connection string and keep the cause', async () => {
    const connectionString =
      'mongodb://user:pa/ss@127.0.0.1:1/unreachable?serverSelectionTimeoutMS=100';
    const logger = createLogger();

    mock.method(mongoose, 'connect', async () => {
      throw new Error(`could not connect to ${connectionString}`);
    });

    const database = new Database(
      connectionString,
      logger as unknown as LoggerInterface,
    );
    const error = (await captureError(database)) as InfraError;

    const logged = String(logger.error.mock.calls[0]?.arguments[0] ?? '');

    assert.match(logged, /^Database connection failed:/);
    assert.ok(!logged.includes('user:pa/ss'));
    assert.ok(logged.includes('mongodb://***@127.0.0.1:1/unreachable'));
    assert.strictEqual(error.message, 'Database connection failed');
    assert.ok(error.cause instanceof Error);
  });

  test('should describe non-Error rejections without losing the payload', async () => {
    const logger = createLogger();

    mock.method(mongoose, 'connect', async () => {
      throw { code: 123, detail: 'boom' };
    });

    const database = new Database(
      UNREACHABLE,
      logger as unknown as LoggerInterface,
    );
    await captureError(database);

    const logged = String(logger.error.mock.calls[0]?.arguments[0] ?? '');

    assert.ok(logged.includes('code: 123'));
    assert.ok(logged.includes('boom'));
    assert.ok(!logged.includes('[object Object]'));
  });

  test('should redact credentials from well-formed and malformed URIs', () => {
    assert.strictEqual(
      redactCredentials('failed for mongodb://user:secret@db:27017/auth'),
      'failed for mongodb://***@db:27017/auth',
    );
    assert.strictEqual(
      redactCredentials('failed for mongodb+srv://user:secret@cluster'),
      'failed for mongodb+srv://***@cluster',
    );
    assert.strictEqual(
      redactCredentials('failed for mongodb://u:pa/ss@host/db'),
      'failed for mongodb://***@host/db',
    );
    assert.strictEqual(
      redactCredentials('failed for mongodb://u:p@ss@host/db'),
      'failed for mongodb://***@host/db',
    );
  });
});
