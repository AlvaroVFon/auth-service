import { Types } from 'mongoose';
import { CodesService } from '../../../../../src/auth/codes/codes.service';
import { CODE_REGEX } from '../../../../../src/common/constants/regex';
import fixture from '../../../../fixtures/fixture';
import { Code, CodeType } from '../../../../../src/auth/codes/code.interface';
import { CodesModel } from '../../../../../src/auth/codes/codes.schema';

describe('Codes Service', () => {
  let codesService: CodesService;

  beforeEach(async () => {
    codesService = new CodesService(CodesModel);
  });

  describe('generateCode()', () => {
    test('should generate an alphanumeric code of length 6', async () => {
      const code = codesService.generateCode();
      assert.strictEqual(code.length, 6);
      assert.ok(CODE_REGEX.test(code));
    });
  });

  describe('create()', () => {
    test('should create a code with specified userId, expiresAt, and used status', async () => {
      const userId = new Types.ObjectId().toString();
      const code = await codesService.create(userId, CodeType.SIGNUP);

      assert.strictEqual(code.code.length, 6);
      assert.ok(CODE_REGEX.test(code.code));
      assert.strictEqual(code.userId.toString(), userId);
      assert.ok(code.expiresAt instanceof Date);
      assert.strictEqual(code.used, false);
    });

    test('should throw an error if userId is invalid', async () => {
      await assert.rejects(
        async () => {
          await codesService.create('invalidUserId', CodeType.SIGNUP);
        },
        {
          name: 'InvalidArgumentError',
          message: 'Invalid userId',
        },
      );
    });

    test('should throw an error if userId is missing', async () => {
      await assert.rejects(
        async () => {
          await (codesService as any).create();
        },
        {
          name: 'InvalidArgumentError',
          message: 'userId is required',
        },
      );
    });

    test('should throw an error if codeType is missing', async () => {
      const userId = new Types.ObjectId().toString();
      await assert.rejects(
        async () => {
          await (codesService as any).create(userId);
        },
        {
          name: 'InvalidArgumentError',
          message: 'codeType is required',
        },
      );
    });

    test('should throw an error if codeType is invalid', async () => {
      const userId = new Types.ObjectId().toString();
      await assert.rejects(
        async () => {
          await (codesService as any).create(userId, 'INVALID_TYPE');
        },
        {
          name: 'InvalidArgumentError',
          message: 'Invalid codeType',
        },
      );
    });

    test('should create multiple codes for the same user with different types', async () => {
      const userId = new Types.ObjectId().toString();

      const signupCode = await codesService.create(userId, CodeType.SIGNUP);
      const resetCode = await codesService.create(
        userId,
        CodeType.PASSWORD_RESET,
      );

      assert.notStrictEqual(signupCode.code, resetCode.code);
      assert.strictEqual(
        signupCode.userId.toString(),
        resetCode.userId.toString(),
      );
      assert.strictEqual(signupCode.type, CodeType.SIGNUP);
      assert.strictEqual(resetCode.type, CodeType.PASSWORD_RESET);
    });

    test('should set expiration time based on CODE_EXPIRATION_MS env variable', async () => {
      const userId = new Types.ObjectId().toString();
      const customExpirationMs = 2 * 60 * 60 * 1000; // 2 hours

      process.env.CODE_EXPIRATION_MS = customExpirationMs.toString();

      codesService = new CodesService(CodesModel);

      const code = await codesService.create(userId, CodeType.SIGNUP);
      const expectedExpiration = Date.now() + customExpirationMs;

      assert.ok(Math.abs(code.expiresAt.getTime() - expectedExpiration) < 1000);

      delete process.env.CODE_EXPIRATION_MS;
    });

    test('should create codes of length defined by CODE_LENGTH env variable', async () => {
      const userId = new Types.ObjectId().toString();
      const customCodeLength = 8;

      process.env.CODE_LENGTH = customCodeLength.toString();

      codesService = new CodesService(CodesModel);

      const code = await codesService.create(userId, CodeType.SIGNUP);

      assert.strictEqual(code.code.length, customCodeLength);

      delete process.env.CODE_LENGTH;
    });

    test('should not create a new code for the same user and type if the code is not expired', async () => {
      const userId = new Types.ObjectId().toString();
      await codesService.create(userId, CodeType.SIGNUP);
      await assert.rejects(
        async () => {
          await codesService.create(userId, CodeType.SIGNUP);
        },
        {
          name: 'AlreadyGeneratedCodeError',
          message:
            'A valid code has already been generated for this user and type',
        },
      );
    });
  });

  describe('validateCode()', () => {
    test('should not throw for a valid, unused, and unexpired code', async () => {
      const userId = new Types.ObjectId().toString();
      const code = await codesService.create(userId, CodeType.SIGNUP);

      await assert.doesNotReject(async () => {
        await codesService.validateCode(userId, code.code, CodeType.SIGNUP);
      });
    });

    test('should set used to true after validating a code', async () => {
      const userId = new Types.ObjectId().toString();
      const code = await codesService.create(userId, CodeType.SIGNUP);

      await codesService.validateCode(userId, code.code, CodeType.SIGNUP);

      const validCode = await fixture.findOne<Code>('Code', {
        code: code.code,
        userId: code.userId,
      });

      assert.strictEqual(validCode?.used, true);
    });

    test('should throw for an invalid code', async () => {
      const userId = new Types.ObjectId().toString();
      await codesService.create(userId, CodeType.SIGNUP);

      await assert.rejects(
        async () => {
          await codesService.validateCode(userId, 'WRONGCODE', CodeType.SIGNUP);
        },
        {
          name: 'InvalidCodeError',
          message: 'The provided code is invalid, used, or expired',
        },
      );
    });

    test('should throw an error for an already used code', async () => {
      const userId = new Types.ObjectId().toString();
      const code = await codesService.create(userId, CodeType.SIGNUP);

      await assert.doesNotReject(async () => {
        await codesService.validateCode(userId, code.code, CodeType.SIGNUP);
      });

      await assert.rejects(
        async () => {
          await codesService.validateCode(userId, code.code, CodeType.SIGNUP);
        },
        {
          name: 'InvalidCodeError',
          message: 'The provided code is invalid, used, or expired',
        },
      );
    });

    test('should throw for an expired code', async () => {
      const userId = new Types.ObjectId().toString();
      const code = await codesService.create(userId, CodeType.SIGNUP);

      // Manually expire the code
      await fixture.updateOne<Code>(
        'Code',
        { code: code.code, userId: code.userId },
        { expiresAt: new Date(Date.now() - 1000) },
      );

      await assert.rejects(
        async () => {
          await codesService.validateCode(userId, code.code, CodeType.SIGNUP);
        },
        {
          name: 'InvalidCodeError',
          message: 'The provided code is invalid, used, or expired',
        },
      );
    });

    test('should throw an error when validating a code with incorrect type', async () => {
      const userId = new Types.ObjectId().toString();
      const code = await codesService.create(userId, CodeType.SIGNUP);

      await assert.rejects(
        async () => {
          await codesService.validateCode(
            userId,
            code.code,
            CodeType.PASSWORD_RESET,
          );
        },
        {
          name: 'InvalidCodeError',
          message: 'The provided code is invalid, used, or expired',
        },
      );
    });

    test('should throw an error if userId is invalid', async () => {
      await assert.rejects(
        async () => {
          await codesService.validateCode(
            'invalidUserId',
            'ABC123',
            CodeType.SIGNUP,
          );
        },
        {
          name: 'InvalidArgumentError',
          message: 'Invalid userId',
        },
      );
    });
    test('should throw an error if userId is missing', async () => {
      await assert.rejects(
        async () => {
          await (codesService as any).validateCode(
            undefined,
            'ABC123',
            CodeType.SIGNUP,
          );
        },
        {
          name: 'InvalidArgumentError',
          message: 'userId is required',
        },
      );
    });

    test('should throw an error if codeType is missing', async () => {
      const userId = new Types.ObjectId().toString();
      await assert.rejects(
        async () => {
          await (codesService as any).validateCode(userId, 'ABC123');
        },
        {
          name: 'InvalidArgumentError',
          message: 'codeType is required',
        },
      );
    });

    test('should throw an error if codeType is invalid', async () => {
      const userId = new Types.ObjectId().toString();
      await assert.rejects(
        async () => {
          await (codesService as any).validateCode(
            userId,
            'ABC123',
            'INVALID_TYPE',
          );
        },
        {
          name: 'InvalidArgumentError',
          message: 'Invalid codeType',
        },
      );
    });

    test('should throw an error if code is missing', async () => {
      const userId = new Types.ObjectId().toString();
      await assert.rejects(
        async () => {
          await (codesService as any).validateCode(
            userId,
            undefined,
            CodeType.SIGNUP,
          );
        },
        {
          name: 'InvalidArgumentError',
          message: 'code is required',
        },
      );
    });
  });
});
