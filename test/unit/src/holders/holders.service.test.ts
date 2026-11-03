import { Model } from 'mongoose';

import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import { Holder } from '../../../../src/holders/holders.interface';
import { HoldersService } from '../../../../src/holders/holders.service';
import { CryptoService } from '../../../../src/libs/crypto/crypto.service';

const cryptoService = {
  hashString: async (value: string) => `hashed:${value}`,
} as unknown as CryptoService;

const serviceWithCreateError = (error: unknown): HoldersService => {
  const model = {
    findOne: async () => null,
    create: async () => {
      throw error;
    },
  } as unknown as Model<Holder>;

  return new HoldersService(model, cryptoService);
};

describe('HoldersService.create duplicate handling', () => {
  test('should map a duplicate-key error to the anti-enumeration error', async () => {
    const service = serviceWithCreateError({ code: 11000 });

    await assert.rejects(
      service.create('race@example.com', 'ValidPass123!'),
      (error: unknown) =>
        error instanceof InvalidArgumentError &&
        error.message === 'Invalid email or password',
    );
  });

  test('should rethrow unexpected persistence errors unchanged', async () => {
    const failure = new Error('database is down');
    const service = serviceWithCreateError(failure);

    await assert.rejects(
      service.create('race@example.com', 'ValidPass123!'),
      (error: unknown) => error === failure,
    );
  });
});
