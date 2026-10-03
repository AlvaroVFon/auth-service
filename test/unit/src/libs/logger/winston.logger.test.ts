import winston from 'winston';

import { WinstonLogger } from '../../../../../src/libs/logger/adapters/winston.logger';

describe('WinstonLogger', () => {
  let logger: WinstonLogger;

  beforeEach(() => {
    logger = new WinstonLogger();
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe('log levels', () => {
    test('info should delegate to the winston logger', () => {
      const info = mock.method(logger.logger, 'info', () => {});

      logger.info('hello');

      assert.strictEqual(info.mock.callCount(), 1);
      assert.deepStrictEqual(info.mock.calls[0]?.arguments, ['hello']);
    });

    test('error should delegate the message when no error is given', () => {
      const error = mock.method(logger.logger, 'error', () => {});

      logger.error('failed');

      assert.deepStrictEqual(error.mock.calls[0]?.arguments, ['failed']);
    });

    test('error should delegate the error argument when given', () => {
      const error = mock.method(logger.logger, 'error', () => {});
      const cause = new Error('boom');

      logger.error('failed', cause);

      assert.deepStrictEqual(error.mock.calls[0]?.arguments, ['failed', cause]);
    });

    test('warn should delegate with and without an error', () => {
      const warn = mock.method(logger.logger, 'warn', () => {});
      const cause = new Error('careful');

      logger.warn('heads up');
      logger.warn('heads up', cause);

      assert.deepStrictEqual(warn.mock.calls[0]?.arguments, ['heads up']);
      assert.deepStrictEqual(warn.mock.calls[1]?.arguments, [
        'heads up',
        cause,
      ]);
    });

    test('debug should delegate with and without an error', () => {
      const debug = mock.method(logger.logger, 'debug', () => {});
      const cause = new Error('detail');

      logger.debug('trace');
      logger.debug('trace', cause);

      assert.deepStrictEqual(debug.mock.calls[0]?.arguments, ['trace']);
      assert.deepStrictEqual(debug.mock.calls[1]?.arguments, ['trace', cause]);
    });
  });

  describe('createLogger()', () => {
    test('should build an info-level logger with a single console transport', () => {
      const created = logger.createLogger();

      assert.strictEqual(created.level, 'info');
      assert.strictEqual(created.transports.length, 1);
      assert.ok(created.transports[0] instanceof winston.transports.Console);
    });
  });
});
