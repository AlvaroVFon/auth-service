import { HealthController } from '../../../../src/health/health.controller';

const createResponse = () => {
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };

  return response;
};

describe('HealthController', () => {
  test('should report liveness without depending on the database', () => {
    const controller = new HealthController(() => 0);
    const response = createResponse();

    controller.check({} as never, response as never);

    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(response.body, { status: 'ok' });
  });

  test('should report readiness when the database connection is open', () => {
    const controller = new HealthController(() => 1);
    const response = createResponse();

    controller.ready({} as never, response as never);

    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(response.body, { status: 'ready' });
  });

  test('should report not ready when the database connection is closed', () => {
    const controller = new HealthController(() => 0);
    const response = createResponse();

    controller.ready({} as never, response as never);

    assert.strictEqual(response.statusCode, 503);
    assert.deepStrictEqual(response.body, { status: 'not ready' });
  });
});
