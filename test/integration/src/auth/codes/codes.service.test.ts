import { Types } from 'mongoose';

import { Code, CodeType } from '../../../../../src/auth/codes/code.interface';
import { CodesModel } from '../../../../../src/auth/codes/codes.schema';
import { CodesService } from '../../../../../src/auth/codes/codes.service';
import { CODE_REGEX } from '../../../../../src/common/constants/regex';
import { InvalidArgumentError } from '../../../../../src/common/exceptions/base.exception';
import {
  AlreadyGeneratedCodeError,
  InvalidCodeError,
} from '../../../../../src/common/exceptions/codes.exceptions';
import fixture from '../../../../fixtures';
import { CodesFactory } from '../../../../helpers/factories/codes.factory';

describe('Codes Service', () => {
  let codesService: CodesService;

  test('should index code lookups by subjectId, type, and used', () => {
    assert.ok(
      CodesModel.schema
        .indexes()
        .some(
          ([fields]) =>
            JSON.stringify(fields) ===
            JSON.stringify({ subjectId: 1, type: 1, used: 1 }),
        ),
    );
  });

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
    test('should create a code with specified subjectId, expiresAt, and used status', async () => {
      const codeData = CodesFactory.generate();
      const code = await codesService.create(
        String(codeData.subjectId),
        codeData.type,
      );

      assert.strictEqual(code.code.length, 6);
      assert.ok(CODE_REGEX.test(code.code));
      assert.strictEqual(code.subjectId.toString(), String(codeData.subjectId));
      assert.ok(code.expiresAt instanceof Date);
      assert.strictEqual(code.used, false);
    });

    test('should throw an error if subjectId is invalid', async () => {
      const codeData = CodesFactory.generate({
        subjectId: 'invalid' as unknown as Types.ObjectId,
      });
      await assert.rejects(async () => {
        await codesService.create(String(codeData.subjectId), codeData.type);
      }, new InvalidArgumentError('Invalid subjectId'));
    });

    test('should throw an error if subjectId is missing', async () => {
      await assert.rejects(async () => {
        await (codesService as any).create();
      }, new InvalidArgumentError('subjectId is required'));
    });

    test('should throw an error if codeType is missing', async () => {
      const subjectId = new Types.ObjectId().toString();
      await assert.rejects(
        codesService.create(subjectId, undefined as unknown as CodeType),
        new InvalidArgumentError('codeType is required'),
      );
    });

    test('should throw an error if codeType is invalid', async () => {
      const subjectId = new Types.ObjectId().toString();
      await assert.rejects(
        codesService.create(subjectId, 'INVALID_TYPE' as CodeType),
        new InvalidArgumentError('Invalid codeType'),
      );
    });

    test('should create multiple codes for the same user with different types', async () => {
      const subjectId = new Types.ObjectId().toString();

      const signupCode = await codesService.create(subjectId, CodeType.SIGNUP);
      const resetCode = await codesService.create(
        subjectId,
        CodeType.RESET_PASSWORD,
      );

      assert.notStrictEqual(signupCode.code, resetCode.code);
      assert.strictEqual(
        signupCode.subjectId.toString(),
        resetCode.subjectId.toString(),
      );
      assert.strictEqual(signupCode.type, CodeType.SIGNUP);
      assert.strictEqual(resetCode.type, CodeType.RESET_PASSWORD);
    });

    test('should set expiration time from the injected value', async () => {
      const subjectId = new Types.ObjectId().toString();
      const customExpirationMs = 2 * 60 * 60 * 1000; // 2 hours

      codesService = new CodesService(CodesModel, customExpirationMs);

      const code = await codesService.create(subjectId, CodeType.SIGNUP);
      const expectedExpiration = Date.now() + customExpirationMs;

      assert.ok(Math.abs(code.expiresAt.getTime() - expectedExpiration) < 1000);
    });

    test('should create codes of the injected length', async () => {
      const subjectId = new Types.ObjectId().toString();
      const customCodeLength = 8;

      codesService = new CodesService(CodesModel, undefined, customCodeLength);

      const code = await codesService.create(subjectId, CodeType.SIGNUP);

      assert.strictEqual(code.code.length, customCodeLength);
    });

    test('should not create a new code for the same user and type if the code is not expired', async () => {
      const subjectId = new Types.ObjectId().toString();
      await codesService.create(subjectId, CodeType.SIGNUP);
      await assert.rejects(
        codesService.create(subjectId, CodeType.SIGNUP),
        new AlreadyGeneratedCodeError(
          'A valid code has already been generated for this user and type',
        ),
      );
    });
  });

  describe('validateCode()', () => {
    test('should consume a code only once under concurrent validation', async () => {
      const subjectId = new Types.ObjectId().toString();
      const code = await codesService.create(subjectId, CodeType.SIGNUP);

      const results = await Promise.allSettled([
        codesService.validateCode(subjectId, code.code, CodeType.SIGNUP),
        codesService.validateCode(subjectId, code.code, CodeType.SIGNUP),
      ]);

      assert.strictEqual(
        results.filter((result) => result.status === 'fulfilled').length,
        1,
      );
      assert.strictEqual(
        results.filter(
          (result) =>
            result.status === 'rejected' &&
            result.reason instanceof InvalidCodeError,
        ).length,
        1,
      );
    });

    test('should not throw for a valid, unused, and unexpired code', async () => {
      const subjectId = new Types.ObjectId().toString();
      const code = await codesService.create(subjectId, CodeType.SIGNUP);

      await assert.doesNotReject(async () => {
        await codesService.validateCode(subjectId, code.code, CodeType.SIGNUP);
      });
    });

    test('should set used to true after validating a code', async () => {
      const subjectId = new Types.ObjectId().toString();
      const code = await codesService.create(subjectId, CodeType.SIGNUP);

      await codesService.validateCode(subjectId, code.code, CodeType.SIGNUP);

      const validCode = await fixture.findOne<Code>('Code', {
        code: code.code,
        subjectId: code.subjectId,
      });

      assert.strictEqual(validCode?.used, true);
    });

    test('should throw for an invalid code', async () => {
      const codeData = CodesFactory.generate();
      await codesService.create(String(codeData.subjectId), codeData.type);

      await assert.rejects(
        codesService.validateCode(
          String(codeData.subjectId),
          'WRONGCODE',
          codeData.type,
        ),
        new InvalidCodeError('The provided code is invalid, used or expired'),
      );
    });

    test('should throw an error for an already used code', async () => {
      const subjectId = new Types.ObjectId().toString();
      const code = await codesService.create(subjectId, CodeType.SIGNUP);

      await assert.doesNotReject(async () => {
        await codesService.validateCode(subjectId, code.code, CodeType.SIGNUP);
      });

      await assert.rejects(
        codesService.validateCode(subjectId, code.code, CodeType.SIGNUP),
        new InvalidCodeError('The provided code is invalid, used or expired'),
      );
    });

    test('should throw for an expired code', async () => {
      const subjectId = new Types.ObjectId().toString();
      const code = await codesService.create(subjectId, CodeType.SIGNUP);

      // Manually expire the code
      await fixture.updateOne<Code>(
        'Code',
        { code: code.code, subjectId: code.subjectId },
        { expiresAt: new Date(Date.now() - 1000) },
      );

      await assert.rejects(
        codesService.validateCode(subjectId, code.code, CodeType.SIGNUP),
        new InvalidCodeError('The provided code is invalid, used or expired'),
      );
    });

    test('should throw an error when validating a code with incorrect type', async () => {
      const subjectId = new Types.ObjectId().toString();
      const code = await codesService.create(subjectId, CodeType.SIGNUP);

      await assert.rejects(
        codesService.validateCode(
          subjectId,
          code.code,
          CodeType.RESET_PASSWORD,
        ),
        new InvalidCodeError('The provided code is invalid, used or expired'),
      );
    });

    test('should throw an error if subjectId is invalid', async () => {
      await assert.rejects(
        codesService.validateCode('invalidHolderId', 'ABC123', CodeType.SIGNUP),
        new InvalidArgumentError('Invalid subjectId'),
      );
    });

    test('should throw an error if subjectId is missing', async () => {
      await assert.rejects(
        codesService.validateCode(
          undefined as unknown as string,
          'ABC123',
          CodeType.SIGNUP,
        ),
        new InvalidArgumentError('subjectId is required'),
      );
    });

    test('should throw an error if codeType is missing', async () => {
      const subjectId = new Types.ObjectId().toString();
      await assert.rejects(
        codesService.validateCode(
          subjectId,
          'ABC123',
          undefined as unknown as CodeType,
        ),
        new InvalidArgumentError('codeType is required'),
      );
    });

    test('should throw an error if codeType is invalid', async () => {
      const subjectId = new Types.ObjectId().toString();
      await assert.rejects(
        codesService.validateCode(
          subjectId,
          'ABC123',
          'INVALID_TYPE' as CodeType,
        ),
        new InvalidArgumentError('Invalid codeType'),
      );
    });

    test('should throw an error if code is missing', async () => {
      const subjectId = new Types.ObjectId().toString();
      await assert.rejects(
        codesService.validateCode(
          subjectId,
          undefined as unknown as string,
          CodeType.SIGNUP,
        ),
        new InvalidArgumentError('code is required'),
      );
    });
  });
});
