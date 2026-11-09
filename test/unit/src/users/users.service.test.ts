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
  test('should count total, verified and every active lockout', async () => {
    const results = [5, 3, 2];
    let call = 0;
    const countDocuments = mock.fn(async () => results[call++] ?? 0);
    const service = new UsersService(
      { countDocuments } as unknown as Model<UserInterface>,
      {} as CryptoService,
    );

    const counts = await service.countUsers();

    assert.deepStrictEqual(counts, {
      total: 5,
      verified: 3,
      unverified: 2,
      locked: 2,
    });
    assert.deepStrictEqual(countDocuments.mock.calls[0]?.arguments[0], {});
    assert.deepStrictEqual(countDocuments.mock.calls[1]?.arguments[0], {
      verified: true,
    });
    const lockout = countDocuments.mock.calls[2]?.arguments[0] as {
      $or: Array<{
        lockoutUntil?: { $gt: Date };
        mfaLockoutUntil?: { $gt: Date };
      }>;
    };
    assert.ok(lockout.$or[0]?.lockoutUntil?.$gt instanceof Date);
    assert.ok(lockout.$or[1]?.mfaLockoutUntil?.$gt instanceof Date);
  });

  test('should return zeros when the collection is empty', async () => {
    const service = new UsersService(
      { countDocuments: async () => 0 } as unknown as Model<UserInterface>,
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
