import type {
  Application,
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from 'express';

import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import { HttpInterceptor } from '../../../../src/common/interceptors/exception.interceptor';

interface Harness {
  run: (error: unknown) => void;
  res: {
    locals: Record<string, unknown>;
    statusCode: number;
    body: unknown;
  };
}

const createHarness = (): Harness => {
  let handler: ErrorRequestHandler | undefined;

  const app = {
    use: (candidate: ErrorRequestHandler) => {
      handler = candidate;
    },
  } as unknown as Application;

  new HttpInterceptor(app);

  const res = {
    locals: {} as Record<string, unknown>,
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  const run = (error: unknown): void => {
    handler!(
      error as Error,
      { originalUrl: '/test', method: 'POST' } as Request,
      res as unknown as Response,
      (() => {}) as NextFunction,
    );
  };

  return { run, res };
};

describe('HttpInterceptor client error mapping', () => {
  test('should honor the 400 status of a body parser error', () => {
    const { run, res } = createHarness();
    const error = new SyntaxError('Unexpected end of JSON input');
    Object.assign(error, { status: 400, type: 'entity.parse.failed' });

    run(error);

    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { message: 'Bad Request' });
  });

  test('should honor the 413 status of an oversized payload', () => {
    const { run, res } = createHarness();
    const error = new Error('request entity too large');
    Object.assign(error, { status: 413, type: 'entity.too.large' });

    run(error);

    assert.strictEqual(res.statusCode, 413);
    assert.deepStrictEqual(res.body, { message: 'Payload Too Large' });
  });

  test('should keep 500 for errors without a 4xx status', () => {
    const { run, res } = createHarness();

    run(new Error('database is down'));

    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { message: 'Internal Server Error' });
  });

  test('should keep mapping BaseError to its status and code', () => {
    const { run, res } = createHarness();

    run(new InvalidArgumentError('Invalid input'));

    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, {
      message: 'Invalid input',
      code: 'INVALID_ARGUMENT',
    });
  });
});
