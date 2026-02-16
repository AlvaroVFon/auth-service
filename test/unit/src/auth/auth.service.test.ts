import { AuthService } from '../../../../src/auth/auth.service';
import { CryptoService } from '../../../../src/libs/crypto/crypto.service';
import { JwtService } from '../../../../src/libs/jwt/jwt.service';
import { UsersService } from '../../../../src/users/users.service';
import { DEFAULT_USER, generateRandomEmail } from '../../../fixtures/defaults';
import fixture from '../../../fixtures/fixture';
import { User } from '../../../../src/users/users.schema';
import { User as UserInterface } from '../../../../src/users/users.interface';
import { Types } from 'mongoose';
import { MailerInterface } from '../../../../src/libs/mailer/mailer.interface';
import { CodesService } from '../../../../src/auth/codes/codes.service';
import { CodesModel } from '../../../../src/auth/codes/codes.schema';
import { Code, CodeType } from '../../../../src/auth/codes/code.interface';
import { RefreshTokenService } from '../../../../src/auth/tokens/refresh-token.service';
import { RefreshTokenModel } from '../../../../src/auth/tokens/refresh-token.schema';
import { RefreshToken } from '../../../../src/auth/tokens/refresh-token.interface';
import { JWT_REGEX } from '../../../../src/common/constants/regex';
import { HoldersService } from '../../../../src/holders/holders.service';
import { HoldersModel } from '../../../../src/holders/holders.schema';
import { Holder } from '../../../../src/holders/holders.interface';
import { DEFAULT_HOLDER } from '../../../fixtures/defaults/holders.default';

describe('Auth Service', () => {
  let authService: AuthService;
  let userService: UsersService;
  let holdersService: HoldersService;
  let codeService: CodesService;
  let refreshTokenService: RefreshTokenService;

  const mockCryptoService = {
    compareString: mock.fn(() => true),
    hashString: mock.fn((str: string) => Promise.resolve(`hashed_${str}`)),
  };
  const mockMailerService = {
    sendSignupVerificationEmail: mock.fn(() => Promise.resolve()),
  };

  const jwtSecret = process.env.JWT_SECRET;
  const jwtExpiresIn = parseInt(process.env.JWT_EXPIRES_IN || '3600', 10);
  const refreshTokenExpiresIn = parseInt(
    process.env.REFRESH_TOKEN_EXPIRES_IN || '86400',
    10,
  );

  beforeEach(async () => {
    await fixture.create('User');

    userService = new UsersService(
      User,
      mockCryptoService as unknown as CryptoService,
    );

    const jwtService = new JwtService(
      jwtSecret!,
      jwtExpiresIn,
      refreshTokenExpiresIn,
    );
    codeService = new CodesService(CodesModel);
    holdersService = new HoldersService(
      HoldersModel,
      mockCryptoService as unknown as CryptoService,
    );
    refreshTokenService = new RefreshTokenService(
      RefreshTokenModel,
      mockCryptoService as unknown as CryptoService,
    );

    authService = new AuthService(
      userService,
      mockCryptoService as unknown as CryptoService,
      jwtService as JwtService,
      mockMailerService as MailerInterface,
      codeService,
      refreshTokenService,
      holdersService,
    );
  });

  test('should be defined', () => {
    assert.ok(authService);
  });

  describe('login()', () => {
    test('should authenticate user and return a tokens', async () => {
      const result = await authService.login({
        email: DEFAULT_USER.email,
        password: 'password123',
      });

      assert.ok(result);
      assert.strictEqual(typeof result.accessToken, 'string');
      assert.strictEqual(typeof result.refreshToken, 'string');
      assert.ok(JWT_REGEX.test(result.accessToken));
      assert.ok(JWT_REGEX.test(result.refreshToken));
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
      await fixture.create<Holder>('Holder');
      await assert.rejects(
        async () =>
          await authService.signup({
            email: DEFAULT_HOLDER.email,
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
      const holder = await authService.signup({
        email,
        password: 'ValidPass123!',
        passwordConfirmation: 'ValidPass123!',
      });

      assert.strictEqual(holder.email, email);
      assert.ok(Types.ObjectId.isValid(holder._id?.toString()));
      assert.ok(holder.password);
      assert.notStrictEqual(holder.password, 'ValidPass123!');
      assert.ok(
        mockMailerService.sendSignupVerificationEmail.mock.calls.length === 1,
      );
      const code = await fixture.findOne<Code>('Code', {
        holderId: holder._id,
        type: CodeType.SIGNUP,
      });

      assert.deepStrictEqual(
        mockMailerService.sendSignupVerificationEmail.mock.calls[0].arguments,
        [
          email,
          {
            userName: email,
            code: code!.toObject().code,
            link: `https://ourservice.com/verify?holderId=${holder._id.toString()}&code=${code!.toObject().code}`,
          },
        ],
      );
    });
  });

  describe('validateSignupVerificationCode()', () => {
    test('should verify holder with valid code', async () => {
      const holder = await fixture.create<Holder>('Holder');
      const code = await fixture.create<Code>('Code', {
        holderId: holder._id,
        type: CodeType.SIGNUP,
      });

      await authService.validateSignupVerificationCode(
        holder._id.toString(),
        code.code,
      );

      const user = await fixture.findOne<UserInterface>('User', {
        email: holder.email,
      });

      assert.ok(user);
      assert.strictEqual(user!.verified, true);
    });

    test('should throw an error for non provided holder', async () => {
      await assert.rejects(
        async () =>
          await authService.validateSignupVerificationCode('', 'somecode'),
        {
          name: 'InvalidArgumentError',
          message: 'holderId is required',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error for non provided code', async () => {
      const holder = await fixture.create<Holder>('Holder');

      await assert.rejects(
        async () =>
          await authService.validateSignupVerificationCode(
            holder._id.toString(),
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

  describe('logout()', () => {
    test('should throw an error if userId is not provided', async () => {
      await assert.rejects(async () => await authService.logout(''), {
        name: 'InvalidArgumentError',
        message: 'userId is required',
        code: 'INVALID_ARGUMENT',
      });
    });

    test('should throw an error if userId is not a valid ObjectId', async () => {
      await assert.rejects(async () => await authService.logout('invalid-id'), {
        name: 'InvalidArgumentError',
        message: 'userId is not a valid ObjectId',
        code: 'INVALID_ARGUMENT',
      });
    });

    test('should throw an error if no active refresh token is found for the user', async () => {
      const user = await fixture.create<UserInterface>('User');

      await assert.rejects(
        async () => await authService.logout(user._id.toString()),
        {
          name: 'EntityNotFoundError',
          message: 'No active refresh token found for the given userId',
          code: 'NOT_FOUND',
        },
      );
    });

    test('should revoke refresh token', async () => {
      const user = await fixture.create<UserInterface>('User');
      const plainToken = 'plain-refresh-token';
      const refreshToken = await refreshTokenService.create({
        userId: user._id,
        token: plainToken,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
      });

      await authService.logout(user._id.toString());

      const revokedToken = await fixture.findById<RefreshToken>(
        'RefreshToken',
        refreshToken._id.toString(),
      );

      assert.ok(revokedToken);
      assert.ok(revokedToken!.revokedAt);
      assert.strictEqual(revokedToken!.replacedByToken, null);
    });
  });
});
