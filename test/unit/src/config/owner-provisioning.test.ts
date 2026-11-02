import {
  OwnerProvisioner,
  provisionOwnerFromEnv,
} from '../../../../src/config/owner-provisioning';
import { LoggerInterface } from '../../../../src/libs/logger/logger.interface';

const createLogger = (): LoggerInterface => ({
  info: mock.fn(),
  warn: mock.fn(),
  error: mock.fn(),
  debug: mock.fn(),
});

const createBootstrap = (
  result = { created: true, userId: '1', email: 'owner@example.com' },
) => {
  return {
    ensureOwner: mock.fn(async () => result),
  } as unknown as OwnerProvisioner;
};

describe('provisionOwnerFromEnv', () => {
  test('should skip when credentials are not configured', async () => {
    const logger = createLogger();
    const ownerBootstrap = createBootstrap();

    const result = await provisionOwnerFromEnv({
      credentials: null,
      ownerBootstrap,
      logger,
    });

    assert.strictEqual(result.status, 'skipped');
    assert.strictEqual(
      (
        ownerBootstrap.ensureOwner as never as { mock: { callCount(): number } }
      ).mock.callCount(),
      0,
    );
  });

  test('should report a created owner without logging the password', async () => {
    const logger = createLogger();
    const ownerBootstrap = createBootstrap();

    const result = await provisionOwnerFromEnv({
      credentials: { email: 'owner@example.com', password: 'StrongOwner123!' },
      ownerBootstrap,
      logger,
    });

    assert.strictEqual(result.status, 'created');
    const logged = (
      logger.info as unknown as { mock: { calls: { arguments: unknown[] }[] } }
    ).mock.calls.flatMap((call) => call.arguments);
    assert.ok(!JSON.stringify(logged).includes('StrongOwner123!'));
  });

  test('should report an existing owner', async () => {
    const logger = createLogger();
    const ownerBootstrap = createBootstrap({
      created: false,
      userId: '1',
      email: 'owner@example.com',
    });

    const result = await provisionOwnerFromEnv({
      credentials: { email: 'owner@example.com', password: 'StrongOwner123!' },
      ownerBootstrap,
      logger,
    });

    assert.strictEqual(result.status, 'existing');
  });
});
