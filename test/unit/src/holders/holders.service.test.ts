import { HoldersService } from '../../../../src/holders/holders.service';
import { HoldersModel } from '../../../../src/holders/holders.schema';
import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import { CryptoService } from '../../../../src/libs/crypto/crypto.service';
import fixture from '../../../fixtures';
import { Holder } from '../../../../src/holders/holders.interface';

describe('HoldersService', () => {
  let holdersService: HoldersService;
  const cryptoService = new CryptoService();

  before(async () => {
    holdersService = new HoldersService(HoldersModel, cryptoService);
  });

  describe('create', () => {
    test('should throw an error if email is not provided', async () => {
      try {
        await holdersService.create('', 'validPassword123');
        throw new Error('Test failed: Expected an error to be thrown');
      } catch (error) {
        assert.ok(error instanceof InvalidArgumentError);
        assert.strictEqual(
          (error as InvalidArgumentError).name,
          'InvalidArgumentError',
        );
        assert.strictEqual(
          (error as InvalidArgumentError).code,
          'INVALID_ARGUMENT',
        );
        assert.strictEqual(
          (error as InvalidArgumentError).message,
          'Email is required',
        );
      }
    });

    test('should throw an error if email has not a valid format', async () => {
      try {
        await holdersService.create('invalid-email-format', 'validPassword123');
        throw new Error('Test failed: Expected an error to be thrown');
      } catch (error) {
        assert.ok(error instanceof InvalidArgumentError);
        assert.strictEqual(
          (error as InvalidArgumentError).name,
          'InvalidArgumentError',
        );
        assert.strictEqual(
          (error as InvalidArgumentError).code,
          'INVALID_ARGUMENT',
        );
        assert.strictEqual(
          (error as InvalidArgumentError).message,
          'Email format is invalid',
        );
      }
    });

    test('should throw an error if password is not provided', async () => {
      try {
        await holdersService.create('valid.email@example.com', '');
        throw new Error('Test failed: Expected an error to be thrown');
      } catch (error) {
        assert.ok(error instanceof InvalidArgumentError);
        assert.strictEqual(
          (error as InvalidArgumentError).name,
          'InvalidArgumentError',
        );
        assert.strictEqual(
          (error as InvalidArgumentError).code,
          'INVALID_ARGUMENT',
        );
        assert.strictEqual(
          (error as InvalidArgumentError).message,
          'Password is required',
        );
      }
    });

    test('should throw an error if password do not meet the requirements', async () => {
      try {
        await holdersService.create('valid.email@example.com', 'short');
        throw new Error('Test failed: Expected an error to be thrown');
      } catch (error) {
        assert.ok(error instanceof InvalidArgumentError);
        assert.strictEqual(
          (error as InvalidArgumentError).name,
          'InvalidArgumentError',
        );
        assert.strictEqual(
          (error as InvalidArgumentError).code,
          'INVALID_ARGUMENT',
        );
        assert.strictEqual(
          (error as InvalidArgumentError).message,
          'Password do not meet complexity requirements',
        );
      }
    });

    test('should throw an error if email already exists', async () => {
      await fixture.create<Holder>('Holder');
      try {
        await holdersService.create(
          'default.holder@example.com',
          'validPassword123!',
        );
        throw new Error('Test failed: Expected an error to be thrown');
      } catch (error) {
        assert.ok(error instanceof InvalidArgumentError);
        assert.strictEqual(
          (error as InvalidArgumentError).name,
          'InvalidArgumentError',
        );
        assert.strictEqual(
          (error as InvalidArgumentError).code,
          'INVALID_ARGUMENT',
        );
        assert.strictEqual(
          (error as InvalidArgumentError).message,
          'Invalid email or password',
        );
      }
    });

    test('should create a new holder with valid email and password', async () => {
      const email = 'new.holder@example.com';
      const password = 'ValidPassword123!';

      const newHolder = await holdersService.create(email, password);
      assert.strictEqual(newHolder.email, email);
      assert.notStrictEqual(newHolder.password, password);

      const dbHolder = await fixture.findOne<Holder>('Holder', { email });
      assert.strictEqual(dbHolder!.email, email);
      assert.ok(newHolder.password === dbHolder!.password);
    });
  });
});
