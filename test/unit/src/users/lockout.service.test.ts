import type { Model } from 'mongoose';

import type { LockoutCounter } from '../../../../src/users/lockout/lockout.schema';
import { LockoutService } from '../../../../src/users/lockout/lockout.service';

const USER_ID = '507f1f77bcf86cd799439011';
const APP_A = '507f1f77bcf86cd799439012';
const MAX_ATTEMPTS = 3;

const counter = (overrides: Partial<LockoutCounter> = {}): LockoutCounter =>
  ({
    _id: 'counter-1',
    failedAttempts: 1,
    lockoutUntil: null,
    lastFailureAt: new Date(),
    ...overrides,
  }) as unknown as LockoutCounter;

interface ModelStub {
  updateOne?: (...args: unknown[]) => Promise<unknown>;
  findOneAndUpdate?: (...args: unknown[]) => Promise<LockoutCounter | null>;
  findById?: (...args: unknown[]) => Promise<LockoutCounter | null>;
}

const buildService = (stub: ModelStub): LockoutService =>
  new LockoutService(
    {
      updateOne: async () => ({ acknowledged: true }),
      ...stub,
    } as unknown as Model<LockoutCounter>,
    MAX_ATTEMPTS,
    60_000,
  );

describe('LockoutService incrementFailure', () => {
  test('retries without upsert when a concurrent insert wins the unique index', async () => {
    const calls: Array<{ filter: unknown; options?: unknown }> = [];
    const service = buildService({
      findOneAndUpdate: async (filter, _update, options) => {
        calls.push({ filter, options });
        if (calls.length === 1) {
          throw Object.assign(new Error('duplicate key'), { code: 11000 });
        }
        return counter();
      },
    });

    const status = await service.incrementFailure(USER_ID, APP_A);

    assert.strictEqual(status.attempts, 1);
    assert.strictEqual(calls.length, 2);
    const retryOptions = calls[1]?.options as { upsert?: boolean } | undefined;
    assert.notStrictEqual(retryOptions?.upsert, true);
  });

  test('rethrows a persistence error that is not a duplicate key', async () => {
    const failure = Object.assign(new Error('database is down'), {
      code: 12345,
    });
    const service = buildService({
      findOneAndUpdate: async () => {
        throw failure;
      },
    });

    await assert.rejects(
      service.incrementFailure(USER_ID, APP_A),
      (error: unknown) => error === failure,
    );
  });

  test('locks through a conditional write guarded by the attempt count', async () => {
    const filters: unknown[] = [];
    const lockoutUntil = new Date(Date.now() + 60_000);
    const service = buildService({
      findOneAndUpdate: async (filter, update, options) => {
        const isLockWrite =
          ((update as { $set?: Record<string, unknown> })?.$set ?? {})
            .lockoutUntil !== undefined &&
          (options as { upsert?: boolean } | undefined)?.upsert !== true;

        if (!isLockWrite) {
          return counter({ failedAttempts: MAX_ATTEMPTS });
        }

        filters.push(filter);
        return counter({
          failedAttempts: MAX_ATTEMPTS,
          lockoutUntil,
        });
      },
    });

    const status = await service.incrementFailure(USER_ID, APP_A);

    assert.strictEqual(filters.length, 1);
    const filter = filters[0] as Record<string, unknown>;
    assert.deepStrictEqual(filter.failedAttempts, { $gte: MAX_ATTEMPTS });
    assert.ok(filter.$or);
    assert.strictEqual(status.locked, true);
    assert.deepStrictEqual(status.lockoutUntil, lockoutUntil);
  });

  test('does not report a lockout when the conditional write loses the race', async () => {
    const service = buildService({
      findOneAndUpdate: async (_filter, update, options) => {
        const isLockWrite =
          ((update as { $set?: Record<string, unknown> })?.$set ?? {})
            .lockoutUntil !== undefined &&
          (options as { upsert?: boolean } | undefined)?.upsert !== true;

        if (!isLockWrite) {
          return counter({ failedAttempts: MAX_ATTEMPTS });
        }
        return null;
      },
      findById: async () => counter({ failedAttempts: 0, lockoutUntil: null }),
    });

    const status = await service.incrementFailure(USER_ID, APP_A);

    assert.strictEqual(status.attempts, 0);
    assert.strictEqual(status.locked, false);
    assert.strictEqual(status.lockoutUntil, null);
  });
});
