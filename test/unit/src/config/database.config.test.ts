import { InfraError } from '../../../../src/common/exceptions/infra.exceptions';
import {
  Database,
  redactCredentials,
} from '../../../../src/config/database.config';
import { silentLogger } from '../../../mocks/logger.mock';

describe('Database.connect error reporting', () => {
  test('should preserve the underlying driver error as cause', async () => {
    const database = new Database(
      'mongodb://127.0.0.1:1/unreachable?serverSelectionTimeoutMS=100&connectTimeoutMS=100',
      silentLogger,
    );

    const error = (await database.connect().then(
      () => null,
      (rejection: unknown) => rejection,
    )) as InfraError;

    assert.ok(error instanceof InfraError);
    assert.strictEqual(error.message, 'Database connection failed');
    assert.ok(error.cause, 'the driver error must be preserved as cause');
    assert.ok(error.cause instanceof Error);
  });

  test('should redact credentials from a connection string in logs', () => {
    assert.strictEqual(
      redactCredentials(
        'connect failed for mongodb://user:secret@db:27017/auth',
      ),
      'connect failed for mongodb://***@db:27017/auth',
    );
    assert.strictEqual(
      redactCredentials('connect failed for mongodb+srv://user:secret@cluster'),
      'connect failed for mongodb+srv://***@cluster',
    );
  });
});
