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
