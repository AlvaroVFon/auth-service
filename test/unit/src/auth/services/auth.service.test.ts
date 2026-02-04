import { AuthService } from '../../../../../src/auth/auth.service';
import { CryptoService } from '../../../../../src/libs/crypto/crypto.service';
import { JwtService } from '../../../../../src/libs/jwt/jwt.service';
import { UsersService } from '../../../../../src/users/users.service';
import {
  DEFAULT_USER,
  generateRandomEmail,
} from '../../../../fixtures/defaults';
import fixture from '../../../../fixtures/fixture';
import { User } from '../../../../../src/users/users.schema';
import { User as UserInterface } from '../../../../../src/users/users.interface';
import { Types } from 'mongoose';
import { MailerInterface } from '../../../../../src/libs/mailer/mailer.interface';
import { CodesService } from '../../../../../src/auth/codes/codes.service';
import { CodesModel } from '../../../../../src/auth/codes/codes.schema';
import { Code, CodeType } from '../../../../../src/auth/codes/code.interface';

describe('Auth Service', () => {
  let authService: AuthService;
  let userService: UsersService;
  let codeService: CodesService;

  const mockCryptoService = {
    compareString: mock.fn(() => true),
    hashString: mock.fn((str: string) => Promise.resolve(`hashed_${str}`)),
  };
  const mockMailerService = {
    sendSignupVerificationEmail: mock.fn(() => Promise.resolve()),
  };

  const jwtSecret = process.env.JWT_SECRET;
  const jwtExpiresIn = parseInt(process.env.JWT_EXPIRES_IN || '3600', 10);

  beforeEach(async () => {
    await fixture.create('User');

    userService = new UsersService(
      User,
      mockCryptoService as unknown as CryptoService,
    );

    const jwtService = new JwtService(jwtSecret!, jwtExpiresIn);
    codeService = new CodesService(CodesModel);

    authService = new AuthService(
      userService,
      mockCryptoService as unknown as CryptoService,
      jwtService as JwtService,
      mockMailerService as MailerInterface,
      codeService,
    );
  });

  test('should be defined', () => {
    assert.ok(authService);
  });

  describe('login()', () => {
    test('should authenticate user and return a token', async () => {
      const jwtRegex =
        /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/;
      const result = await authService.login({
        email: DEFAULT_USER.email,
        password: 'password123',
      });

      assert.ok(result);
      assert.strictEqual(typeof result, 'string');
      assert.ok(jwtRegex.test(result));
    });

    test('should throw an error for non existing email', async () => {
      await assert.rejects(
        async () =>
          await authService.login({
            email: 'invalid@example.com',
            password: 'wrongpassword',
          }),
        {
          name: 'InvalidCredentialsError',
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
        },
      );
    });

    test('should throw an error for empty credentials', async () => {
      await assert.rejects(
        async () =>
          await authService.login({
            email: '',
            password: '',
          }),
        {
          name: 'InvalidArgumentError',
          message: 'Email and password are required',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error for invalid password', async () => {
      mockCryptoService.compareString = mock.fn(() => false);
      await assert.rejects(
        async () =>
          await authService.login({
            email: DEFAULT_USER.email,
            password: 'wrongpassword',
          }),
        {
          name: 'InvalidCredentialsError',
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
        },
      );
    });

    test('should throw an error for empty credentials', async () => {
      await assert.rejects(
        async () =>
          await authService.login({
            email: '',
            password: '',
          }),
        {
          name: 'InvalidArgumentError',
          message: 'Email and password are required',
          code: 'INVALID_ARGUMENT',
        },
      );
    });
  });

  describe('signup()', () => {
    test('should throw an error if invalid email is provided', async () => {
      await assert.rejects(
        async () =>
          await authService.signup({
            email: 'invalid-email',
            password: 'ValidPass123!',
            passwordConfirmation: 'ValidPass123!',
          }),
        {
          name: 'InvalidArgumentError',
          message: 'Invalid email format',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error if email is not provided', async () => {
      await assert.rejects(
        async () =>
          await authService.signup({
            email: '',
            password: 'ValidPass123!',
            passwordConfirmation: 'ValidPass123!',
          }),
        {
          name: 'InvalidArgumentError',
          message: 'Email is required',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error if password is not provided', async () => {
      await assert.rejects(
        async () =>
          await authService.signup({
            email: generateRandomEmail('auth+'),
            password: '',
            passwordConfirmation: '',
          }),
        {
          name: 'InvalidArgumentError',
          message: 'Password is required',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error if password confirmation does not match', async () => {
      await assert.rejects(
        async () =>
          await authService.signup({
            email: generateRandomEmail('auth+'),
            password: 'ValidPass123!',
            passwordConfirmation: 'DifferentPass123!',
          }),
        {
          name: 'InvalidArgumentError',
          message: 'Password and password confirmation do not match',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error if password is too weak', async () => {
      await assert.rejects(
        async () =>
          await authService.signup({
            email: generateRandomEmail('auth+'),
            password: 'alllowercase',
            passwordConfirmation: 'alllowercase',
          }),
        {
          name: 'InvalidArgumentError',
          message: 'Password does not meet complexity requirements',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error if email is already in use', async () => {
      await assert.rejects(
        async () =>
          await authService.signup({
            email: DEFAULT_USER.email,
            password: 'ValidPass123!',
            passwordConfirmation: 'ValidPass123!',
          }),
        {
          name: 'InvalidArgumentError',
          message: 'Invalid email or password',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should succeed with valid credentials', async () => {
      const email = generateRandomEmail('auth+');
      const user = await authService.signup({
        email,
        password: 'ValidPass123!',
        passwordConfirmation: 'ValidPass123!',
      });

      assert.strictEqual(user.email, email);
      assert.ok(Types.ObjectId.isValid(user._id?.toString()));
      assert.ok(user.password);
      assert.notStrictEqual(user.password, 'ValidPass123!');
      assert.ok(
        mockMailerService.sendSignupVerificationEmail.mock.calls.length === 1,
      );
      const code = await fixture.findOne<Code>('Code', {
        userId: user._id,
        type: CodeType.SIGNUP,
      });

      assert.deepStrictEqual(
        mockMailerService.sendSignupVerificationEmail.mock.calls[0].arguments,
        [
          email,
          {
            userName: email,
            code: code.toObject().code,
            link: `https://ourservice.com/verify?userId=${user._id.toString()}&code=${code.toObject().code}`,
          },
        ],
      );
    });
  });

  describe('validateSignupVerificationCode()', () => {
    test('should verify user with valid code', async () => {
      const user = await fixture.create<UserInterface>('User', {
        verified: false,
      });
      const code = await fixture.create<Code>('Code', {
        userId: user._id,
        type: CodeType.SIGNUP,
      });

      await authService.validateSignupVerificationCode(
        user._id.toString(),
        code.code,
      );

      const updatedUser = await fixture.findById<UserInterface>(
        'User',
        user._id.toString(),
      );
      assert.ok(updatedUser);
      assert.strictEqual(updatedUser!.verified, true);
    });

    test('should throw an error for non provided userId', async () => {
      await assert.rejects(
        async () =>
          await authService.validateSignupVerificationCode('', 'somecode'),
        {
          name: 'InvalidArgumentError',
          message: 'userId is required',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error for non provided code', async () => {
      const user = await fixture.create<UserInterface>('User', {
        verified: false,
      });

      await assert.rejects(
        async () =>
          await authService.validateSignupVerificationCode(
            user._id.toString(),
            '',
          ),
        {
          name: 'InvalidArgumentError',
          message: 'code is required',
          code: 'INVALID_ARGUMENT',
        },
      );
    });
  });

  describe('resetPassword()', () => {
    test('should throw an error for non provided userId', async () => {
      await assert.rejects(
        async () => await authService.resetPassword('', '', 'NewPass123!'),
        {
          name: 'InvalidArgumentError',
          message: 'userId is required',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error for non provided newPassword', async () => {
      const user = await fixture.create<UserInterface>('User');

      await assert.rejects(
        async () =>
          await authService.resetPassword(
            user._id.toString(),
            '',
            'Password123!',
          ),
        {
          name: 'InvalidArgumentError',
          message: 'newPassword is required',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error for weak newPassword', async () => {
      const user = await fixture.create<UserInterface>('User');

      await assert.rejects(
        async () =>
          await authService.resetPassword(user._id.toString(), 'weak', 'weak'),
        {
          name: 'InvalidArgumentError',
          message: 'Password does not meet complexity requirements',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error if password confirmation does not match', async () => {
      const user = await fixture.create<UserInterface>('User');

      await assert.rejects(
        async () =>
          await authService.resetPassword(
            user._id.toString(),
            'NewPass123!',
            'DifferentPass123!',
          ),
        {
          name: 'InvalidArgumentError',
          message: 'Password and password confirmation do not match',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error for non provided passwordConfirmation', async () => {
      const user = await fixture.create<UserInterface>('User');

      await assert.rejects(
        async () =>
          await authService.resetPassword(
            user._id.toString(),
            'NewPass123!',
            '',
          ),
        {
          name: 'InvalidArgumentError',
          message: 'passwordConfirmation is required',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should succeed with valid inputs', async () => {
      const user = await fixture.create<UserInterface>('User');

      await assert.doesNotReject(
        async () =>
          await authService.resetPassword(
            user._id.toString(),
            'NewPass123!',
            'NewPass123!',
          ),
      );
    });

    test('should hash the new password when resetting password', async () => {
      const user = await fixture.create<UserInterface>('User');

      const newPassword = 'NewPass123!';
      await authService.resetPassword(
        user._id.toString(),
        newPassword,
        newPassword,
      );

      const updatedUser = await fixture.findById<UserInterface>(
        'User',
        user._id.toString(),
      );
      assert.ok(updatedUser);
      assert.notStrictEqual(updatedUser!.password, newPassword);
      assert.strictEqual(updatedUser!.password, `hashed_${newPassword}`);
    });

    test('should call updateOneById with correct parameters', async () => {
      const user = await fixture.create<UserInterface>('User');

      const newPassword = 'NewPass123!';

      const updateOneByIdSpy = mock.method(userService, 'updateOneById');

      await authService.resetPassword(
        user._id.toString(),
        newPassword,
        newPassword,
      );

      assert.ok(updateOneByIdSpy.mock.calls.length === 1);
      assert.deepStrictEqual(updateOneByIdSpy.mock.calls[0].arguments, [
        user._id.toString(),
        { password: `hashed_${newPassword}` },
      ]);
    });

    test('should throw an error if userId does not exist', async () => {
      const nonExistentUserId = new Types.ObjectId().toString();
      const newPassword = 'NewPass123!';

      await assert.rejects(
        async () =>
          await authService.resetPassword(
            nonExistentUserId,
            newPassword,
            newPassword,
          ),
        {
          name: 'EntityNotFoundError',
          message: 'User not found',
          code: 'NOT_FOUND',
        },
      );
    });
  });
});
