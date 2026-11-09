import { Model } from 'mongoose';

import { EntityAlreadyExistsError } from '../../../../src/common/exceptions/base.exception';
import { CryptoService } from '../../../../src/libs/crypto/crypto.service';
import { User as UserInterface } from '../../../../src/users/users.interface';
import { UsersService } from '../../../../src/users/users.service';

const serviceWithCreateError = (error: unknown): UsersService => {
  const model = {
    findOne: async () => null,
    create: async () => {
      throw error;
    },
  } as unknown as Model<UserInterface>;

  return new UsersService(model, {} as CryptoService);
};

describe('UsersService.createVerifiedUser duplicate handling', () => {
  test('should map a duplicate-key error to EntityAlreadyExistsError', async () => {
    const service = serviceWithCreateError({ code: 11000 });

    await assert.rejects(
      service.createVerifiedUser({
        email: 'race@example.com',
        passwordHash: 'hash',
      }),
      (error: unknown) =>
        error instanceof EntityAlreadyExistsError &&
        error.message === 'Email already exists',
    );
  });

  test('should rethrow unexpected persistence errors unchanged', async () => {
    const failure = new Error('database is down');
    const service = serviceWithCreateError(failure);

    await assert.rejects(
      service.createVerifiedUser({
        email: 'race@example.com',
        passwordHash: 'hash',
      }),
      (error: unknown) => error === failure,
    );
  });
});

describe('UsersService.countUsers', () => {
  test('should group by verified and active lockout and derive the unverified total', async () => {
    const aggregate = mock.fn(async () => [
      { total: 5, verified: 3, locked: 2 },
    ]);
    const service = new UsersService(
      { aggregate } as unknown as Model<UserInterface>,
      {} as CryptoService,
    );

    const counts = await service.countUsers();

    assert.deepStrictEqual(counts, {
      total: 5,
      verified: 3,
      unverified: 2,
      locked: 2,
    });
    const pipeline = aggregate.mock.calls[0]?.arguments[0] as Array<{
      $group: {
        total: unknown;
        verified: unknown;
        locked: { $sum: { $cond: [unknown, 1, 0] } };
      };
    }>;
    const group = pipeline[0]!.$group;
    assert.deepStrictEqual(group.total, { $sum: 1 });
    assert.deepStrictEqual(group.verified, {
      $sum: { $cond: ['$verified', 1, 0] },
    });
    const lockout = group.locked.$sum.$cond[0] as {
      $gt: [string, Date];
    };
    assert.strictEqual(lockout.$gt[0], '$lockoutUntil');
    assert.ok(lockout.$gt[1] instanceof Date);
  });

  test('should return zeros when the collection is empty', async () => {
    const service = new UsersService(
      { aggregate: async () => [] } as unknown as Model<UserInterface>,
      {} as CryptoService,
    );

    assert.deepStrictEqual(await service.countUsers(), {
      total: 0,
      verified: 0,
      unverified: 0,
      locked: 0,
    });
  });
});
