import { HttpLoggerInterceptor } from '../../../../src/common/interceptors/httplogger.interceptor';
import { isHealthProbe } from '../../../../src/health/health.paths';
import { LoggerInterface } from '../../../../src/libs/logger/logger.interface';

const createLogger = (): LoggerInterface => ({
  info: mock.fn(),
  error: mock.fn(),
  warn: mock.fn(),
  debug: mock.fn(),
});

const createRequest = (path: string) => ({
  method: 'GET',
  originalUrl: path,
  path,
  headers: {},
});

const createResponse = () => {
  let onFinish: (() => void) | undefined;

  return {
    statusCode: 200,
    locals: {},
    on(event: string, callback: () => void) {
      if (event === 'finish') {
        onFinish = callback;
      }
      return this;
    },
    finish() {
      onFinish?.();
    },
  };
};

const infoCalls = (logger: LoggerInterface): number =>
  (
    logger.info as unknown as { mock: { callCount(): number } }
  ).mock.callCount();

describe('HttpLoggerInterceptor', () => {
  test('should not log probe requests', () => {
    const logger = createLogger();
    const interceptor = new HttpLoggerInterceptor(logger, (request) =>
      isHealthProbe(request.path),
    );
    const response = createResponse();
    const next = mock.fn();

    interceptor.intercept(
      createRequest('/health') as never,
      response as never,
      next as never,
    );
    response.finish();

    assert.strictEqual(next.mock.callCount(), 1);
    assert.strictEqual(infoCalls(logger), 0);
  });

  test('should keep logging application requests', () => {
    const logger = createLogger();
    const interceptor = new HttpLoggerInterceptor(logger, (request) =>
      isHealthProbe(request.path),
    );
    const response = createResponse();
    const next = mock.fn();

    interceptor.intercept(
      createRequest('/users') as never,
      response as never,
      next as never,
    );
    response.finish();

    assert.strictEqual(next.mock.callCount(), 1);
    assert.strictEqual(infoCalls(logger), 1);
  });

  test('should log every request when no skip predicate is provided', () => {
    const logger = createLogger();
    const interceptor = new HttpLoggerInterceptor(logger);
    const response = createResponse();

    interceptor.intercept(
      createRequest('/health') as never,
      response as never,
      mock.fn() as never,
    );
    response.finish();

    assert.strictEqual(infoCalls(logger), 1);
  });
});
