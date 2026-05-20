import { HoldersService } from '../../../../src/holders/holders.service';
import { HoldersModel } from '../../../../src/holders/holders.schema';
import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import { CryptoService } from '../../../../src/libs/crypto/crypto.service';
import fixture from '../../../fixtures';
import { Holder } from '../../../../src/holders/holders.interface';
import { HolderFactory } from '../../../helpers/factories/holder.factory';

describe('HoldersService', () => {
  let holdersService: HoldersService;
  const cryptoService = new CryptoService();

  before(async () => {
    holdersService = new HoldersService(HoldersModel, cryptoService);
  });

  describe('create', () => {
    test('should throw an error if email is not provided', async () => {
      const holderData = HolderFactory.generate({
        email: undefined as unknown as string,
      });
      await assert.rejects(
        holdersService.create(holderData.email, holderData.password),
        new InvalidArgumentError('Email is required'),
      );
    });

    test('should throw an error if email has not a valid format', async () => {
      const holderData = HolderFactory.generate({
        email: 'invalid-email-format',
      });
      await assert.rejects(
        holdersService.create(holderData.email, holderData.password),
        new InvalidArgumentError('Email format is invalid'),
      );
    });

    test('should throw an error if password is not provided', async () => {
      const holderData = HolderFactory.generate({ password: '' });
      await assert.rejects(
        holdersService.create(holderData.email, holderData.password),
        new InvalidArgumentError('Password is required'),
      );
    });

    test('should throw an error if password do not meet the requirements', async () => {
      const holderData = HolderFactory.generate({ password: 'short' });
      await assert.rejects(
        holdersService.create(holderData.email, holderData.password),
        new InvalidArgumentError(
          'Password do not meet complexity requirements',
        ),
      );
    });

    test('should throw an error if email already exists', async () => {
      const holderData = HolderFactory.generate({
        email: 'default.holder@example.com',
      });
      await fixture.create<Holder>('Holder');
      await assert.rejects(
        holdersService.create(holderData.email, holderData.password),
        new InvalidArgumentError('Invalid email or password'),
      );
    });

    test('should create a new holder with valid email and password', async () => {
      const holderData = HolderFactory.generate();

      const newHolder = await holdersService.create(
        holderData.email,
        holderData.password,
      );
      assert.strictEqual(newHolder.email, holderData.email);
      assert.notStrictEqual(newHolder.password, holderData.password);

      const dbHolder = await fixture.findOne<Holder>('Holder', {
        email: holderData.email,
      });
      assert.strictEqual(dbHolder!.email, holderData.email);
      assert.ok(newHolder.password === dbHolder!.password);
    });
  });
});
