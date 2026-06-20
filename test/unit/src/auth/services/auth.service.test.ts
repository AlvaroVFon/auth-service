import { AuthService } from '../../../../../src/auth/services/auth.service';
import { CryptoService } from '../../../../../src/libs/crypto/crypto.service';
import { JwtService } from '../../../../../src/libs/jwt/jwt.service';
import { UsersService } from '../../../../../src/users/users.service';
import {
  DEFAULT_USER,
  DEFAULT_USER_ID,
  generateRandomEmail,
} from '../../../../fixtures/defaults';
import fixture from '../../../../fixtures';
import { User } from '../../../../../src/users/users.schema';
import { User as UserInterface } from '../../../../../src/users/users.interface';
import { Types } from 'mongoose';
import { MailerInterface } from '../../../../../src/libs/mailer/mailer.interface';
import { CodesService } from '../../../../../src/auth/codes/codes.service';
import { CodesModel } from '../../../../../src/auth/codes/codes.schema';
import { Code, CodeType } from '../../../../../src/auth/codes/code.interface';
import { RefreshTokenService } from '../../../../../src/auth/tokens/refresh-token.service';
import { RefreshTokenModel } from '../../../../../src/auth/tokens/refresh-token.schema';
import { BlacklistService } from '../../../../../src/auth/tokens/blacklist.service';
import { BlacklistedTokenModel } from '../../../../../src/auth/tokens/blacklisted-token.schema';
import { RefreshToken } from '../../../../../src/auth/tokens/refresh-token.interface';
import { JWT_REGEX } from '../../../../../src/common/constants/regex';
import { HoldersService } from '../../../../../src/holders/holders.service';
import { HoldersModel } from '../../../../../src/holders/holders.schema';
import { Holder } from '../../../../../src/holders/holders.interface';
import { DEFAULT_HOLDER } from '../../../../fixtures/defaults/holders.default';
import { TokenTypes } from '../../../../../src/libs/jwt/token-types.enum';
import { Roles } from '../../../../../src/common/enums/roles.enum';

describe('Auth Service', () => {
  let authService: AuthService;
  let userService: UsersService;
  let holdersService: HoldersService;
  let codeService: CodesService;
  let refreshTokenService: RefreshTokenService;
  let blacklistService: BlacklistService;
  let jwtService: JwtService;

  const mockCryptoService = {
    compareString: mock.fn(() => true),
    hashString: mock.fn((str: string) => Promise.resolve(`hashed_${str}`)),
  } as CryptoService;

  const mockMailerService = {
    sendSignupVerificationEmail: mock.fn(() => Promise.resolve()),
    sendResetPasswordEmail: mock.fn(() => Promise.resolve()),
  } as MailerInterface;

  const jwtSecret = process.env.JWT_SECRET;
  const jwtExpiresIn = parseInt(process.env.JWT_EXPIRES_IN || '3600', 10);
  const refreshTokenExpiresIn = parseInt(
    process.env.JWT_REFRESH_EXPIRES_IN || '86400',
    10,
  );

  beforeEach(async () => {
    await fixture.create('User');

    userService = new UsersService(
      User,
      mockCryptoService as unknown as CryptoService,
    );

    jwtService = new JwtService(
      jwtSecret!,
      jwtExpiresIn,
      refreshTokenExpiresIn,
    );
    codeService = new CodesService(CodesModel);
    holdersService = new HoldersService(
      HoldersModel,
      mockCryptoService as unknown as CryptoService,
    );
    refreshTokenService = new RefreshTokenService(RefreshTokenModel);
    blacklistService = new BlacklistService(BlacklistedTokenModel);

    authService = new AuthService(
      userService,
      mockCryptoService as unknown as CryptoService,
      jwtService,
      mockMailerService as MailerInterface,
      codeService,
      refreshTokenService,
      blacklistService,
      holdersService,
      5,
      900000,
    );
  });

  test('should be defined', () => {
    assert.ok(authService);
  });

  describe('login()', () => {
    test('should authenticate user and return tokens', async () => {
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
      mockCryptoService.compareString = mock.fn(async () => false);
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
  });

  describe('Account Lockout', () => {
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCKOUT_DURATION_MS = 900000;

    beforeEach(() => {
      authService = new AuthService(
        userService,
        mockCryptoService as unknown as CryptoService,
        jwtService,
        mockMailerService as MailerInterface,
        codeService,
        refreshTokenService,
        blacklistService,
        holdersService,
        MAX_LOGIN_ATTEMPTS,
        LOCKOUT_DURATION_MS,
      );
    });

    test('should increment loginAttempts on failed login', async () => {
      const email = generateRandomEmail('lockout+');
      const user = await fixture.create<UserInterface>('User', {
        email,
        loginAttempts: 0,
        lockoutUntil: null,
      });

      (mockCryptoService as any).compareString = mock.fn(async () => false);

      await assert.rejects(
        async () =>
          await authService.login({ email, password: 'wrongpassword' }),
        {
          name: 'InvalidCredentialsError',
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
        },
      );

      const updatedUser = await fixture.findById<UserInterface>(
        'User',
        user._id.toString(),
      );
      assert.ok(updatedUser);
      assert.strictEqual(updatedUser!.loginAttempts, 1);
      assert.strictEqual(updatedUser!.lockoutUntil, null);
    });

    test('should reset loginAttempts and lockoutUntil on successful login', async () => {
      const email = generateRandomEmail('lockout+');
      await fixture.create<UserInterface>('User', {
        email,
        loginAttempts: 3,
        lockoutUntil: new Date(Date.now() - 1000),
      });

      (mockCryptoService as any).compareString = mock.fn(async () => true);

      const result = await authService.login({
        email,
        password: 'password123',
      });

      assert.ok(result);
      assert.strictEqual(typeof result.accessToken, 'string');
      assert.strictEqual(typeof result.refreshToken, 'string');

      const updatedUser = await fixture.findOne<UserInterface>('User', {
        email,
      });
      assert.ok(updatedUser);
      assert.strictEqual(updatedUser!.loginAttempts, 0);
      assert.strictEqual(updatedUser!.lockoutUntil, null);
    });

    test('should set lockoutUntil when loginAttempts reaches MAX_LOGIN_ATTEMPTS', async () => {
      const email = generateRandomEmail('lockout+');
      await fixture.create<UserInterface>('User', {
        email,
        loginAttempts: MAX_LOGIN_ATTEMPTS - 1,
        lockoutUntil: null,
      });

      (mockCryptoService as any).compareString = mock.fn(async () => false);

      const beforeLogin = Date.now();

      await assert.rejects(
        async () =>
          await authService.login({ email, password: 'wrongpassword' }),
        {
          name: 'InvalidCredentialsError',
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
        },
      );

      const afterLogin = Date.now();

      const updatedUser = await fixture.findOne<UserInterface>('User', {
        email,
      });
      assert.ok(updatedUser);
      assert.strictEqual(updatedUser!.loginAttempts, MAX_LOGIN_ATTEMPTS);
      assert.ok(updatedUser!.lockoutUntil);
      const lockoutUntilTime = updatedUser!.lockoutUntil!.getTime();
      assert.ok(lockoutUntilTime >= beforeLogin + LOCKOUT_DURATION_MS - 1000);
      assert.ok(lockoutUntilTime <= afterLogin + LOCKOUT_DURATION_MS + 1000);
    });

    test('should throw AccountLockedError when account is locked', async () => {
      const email = generateRandomEmail('lockout+');
      await fixture.create<UserInterface>('User', {
        email,
        loginAttempts: MAX_LOGIN_ATTEMPTS,
        lockoutUntil: new Date(Date.now() + 60000),
      });

      (mockCryptoService as any).compareString = mock.fn(async () => true);

      await assert.rejects(
        async () => await authService.login({ email, password: 'password123' }),
        {
          name: 'AccountLockedError',
          message: 'Account is temporarily locked. Please try again later.',
          code: 'ACCOUNT_LOCKED',
          statusCode: 423,
        },
      );
    });

    test('should allow login when lockout has expired', async () => {
      const email = generateRandomEmail('lockout+');
      await fixture.create<UserInterface>('User', {
        email,
        loginAttempts: MAX_LOGIN_ATTEMPTS,
        lockoutUntil: new Date(Date.now() - 1000),
      });

      (mockCryptoService as any).compareString = mock.fn(async () => true);

      const result = await authService.login({
        email,
        password: 'password123',
      });

      assert.ok(result);
      assert.strictEqual(typeof result.accessToken, 'string');
      assert.strictEqual(typeof result.refreshToken, 'string');
    });

    test('should check lockout before comparing password', async () => {
      const email = generateRandomEmail('lockout+');
      await fixture.create<UserInterface>('User', {
        email,
        loginAttempts: MAX_LOGIN_ATTEMPTS,
        lockoutUntil: new Date(Date.now() + 60000),
      });

      const compareStringMock = mock.fn(async () => true);
      (mockCryptoService as any).compareString = compareStringMock;

      await assert.rejects(
        async () => await authService.login({ email, password: 'password123' }),
        {
          name: 'AccountLockedError',
          message: 'Account is temporarily locked. Please try again later.',
          code: 'ACCOUNT_LOCKED',
          statusCode: 423,
        },
      );

      // Password comparison must NOT have been called
      assert.strictEqual(compareStringMock.mock.calls.length, 0);
    });

    test('should exclude loginAttempts and lockoutUntil from JSON serialization', async () => {
      const email = generateRandomEmail('lockout+');
      const user = await fixture.create<UserInterface>('User', {
        email,
        loginAttempts: 3,
        lockoutUntil: new Date(),
      });

      const userDoc = await fixture.findById<UserInterface>(
        'User',
        user._id.toString(),
      );
      assert.ok(userDoc);

      const json = (userDoc as any).toJSON();

      assert.strictEqual('loginAttempts' in json, false);
      assert.strictEqual('lockoutUntil' in json, false);
      // password is already excluded - confirm it stays excluded
      assert.strictEqual('password' in json, false);
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
        // @ts-expect-error mock.call exists
        mockMailerService.sendSignupVerificationEmail.mock.calls.length === 1,
      );
      const code = await fixture.findOne<Code>('Code', {
        holderId: holder._id,
        type: CodeType.SIGNUP,
      });

      assert.deepStrictEqual(
        // @ts-expect-error mock.call exists
        mockMailerService.sendSignupVerificationEmail.mock.calls[0].arguments,
        [
          email,
          {
            userName: email,
            code: code!.code,
            link: `https://ourservice.com/verify?holderId=${holder._id.toString()}&code=${code!.code}`,
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

  describe('forgotPassword()', () => {
    test('should throw an error for non provided email', async () => {
      await assert.rejects(async () => await authService.forgotPassword(''), {
        name: 'InvalidArgumentError',
        message: 'email is required',
        code: 'INVALID_ARGUMENT',
      });
    });

    test('should throw an error for invalid email format', async () => {
      await assert.rejects(
        async () => await authService.forgotPassword('invalid-email-format'),
        {
          name: 'InvalidArgumentError',
          message: 'email has invalid format',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error if user does not exist', async () => {
      const email = generateRandomEmail('auth+');
      await assert.rejects(
        async () => await authService.forgotPassword(email),
        {
          name: 'EntityNotFoundError',
          message: `user with email ${email} not found`,
          code: 'NOT_FOUND',
        },
      );
    });

    test('on yellow brick road', async () => {
      const email = generateRandomEmail('forgot-password');
      const user = await fixture.create<UserInterface>('User', { email });

      await authService.forgotPassword(email);

      // @ts-expect-error mock.call exists
      assert(mockMailerService.sendResetPasswordEmail.mock.calls.length === 1);

      const code = await fixture.findOne<Code>('Code', {
        holderId: user._id.toString(),
        used: false,
      });

      assert.deepStrictEqual(
        // @ts-expect-error mock.call exists
        mockMailerService.sendResetPasswordEmail.mock.calls[0].arguments,
        [
          email,
          {
            username: user.email,
            email,
            code: code!.code,
            link: `https://ourservice.com/reset-password?userId=${user._id}&code=${code!.code}`,
          },
        ],
      );
    });
  });

  describe('resetPassword()', () => {
    test('should throw an error for non provided userId', async () => {
      await assert.rejects(
        async () =>
          await authService.resetPassword('', 'CODE123', '', 'NewPass123!'),
        {
          name: 'InvalidArgumentError',
          message: 'userId is required',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error for non provided code', async () => {
      const user = await fixture.create<UserInterface>('User');

      await assert.rejects(
        async () =>
          await authService.resetPassword(
            user._id.toString(),
            '',
            'NewPass123!',
            'NewPass123!',
          ),
        {
          name: 'InvalidArgumentError',
          message: 'code is required',
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
            'CODE123',
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
          await authService.resetPassword(
            user._id.toString(),
            'CODE123',
            'weak',
            'weak',
          ),
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
            'CODE123',
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
            'CODE123',
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
      const code = await fixture.create<Code>('Code', {
        holderId: user._id,
        type: CodeType.RESET_PASSWORD,
        used: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

      await assert.doesNotReject(
        async () =>
          await authService.resetPassword(
            user._id.toString(),
            code.code,
            'NewPass123!',
            'NewPass123!',
          ),
      );
    });

    test('should hash the new password when resetting password', async () => {
      const user = await fixture.create<UserInterface>('User');
      const code = await fixture.create<Code>('Code', {
        holderId: user._id,
        type: CodeType.RESET_PASSWORD,
        used: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const newPassword = 'NewPass123!';
      await authService.resetPassword(
        user._id.toString(),
        code.code,
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
      const code = await fixture.create<Code>('Code', {
        holderId: user._id,
        type: CodeType.RESET_PASSWORD,
        used: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const newPassword = 'NewPass123!';

      const updateOneByIdSpy = mock.method(userService, 'updateOneById');

      await authService.resetPassword(
        user._id.toString(),
        code.code,
        newPassword,
        newPassword,
      );

      assert.ok(updateOneByIdSpy.mock.calls.length === 1);
      assert.deepStrictEqual(updateOneByIdSpy.mock.calls[0].arguments, [
        user._id.toString(),
        { password: `hashed_${newPassword}` },
      ]);
    });

    test('should throw an error if code is invalid', async () => {
      const user = await fixture.create<UserInterface>('User');

      await assert.rejects(
        async () =>
          await authService.resetPassword(
            user._id.toString(),
            'WRONGCODE',
            'NewPass123!',
            'NewPass123!',
          ),
        {
          name: 'InvalidCodeError',
          message: 'The provided code is invalid, used or expired',
          code: 'INVALID_CODE',
        },
      );
    });

    test('should throw an error if userId does not exist', async () => {
      const nonExistentUserId = new Types.ObjectId().toString();
      const newPassword = 'NewPass123!';

      await assert.rejects(
        async () =>
          await authService.resetPassword(
            nonExistentUserId,
            'CODE123',
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

  describe('refreshToken()', () => {
    test('should throw an error if invalid userId is provided', async () => {
      await assert.rejects(
        async () =>
          await authService.refreshToken('invalid-id', 'some-jwt-token'),
        {
          name: 'InvalidArgumentError',
          message: 'userId is not a valid ObjectId',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw an error if no refreshToken is provided', async () => {
      await assert.rejects(
        async () =>
          await authService.refreshToken(DEFAULT_USER_ID.toString(), ''),
        {
          name: 'InvalidArgumentError',
          message: 'refreshToken is required',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should throw if JWT is invalid', async () => {
      await assert.rejects(
        async () =>
          await authService.refreshToken(
            DEFAULT_USER_ID.toString(),
            'not-a-jwt',
          ),
        {
          name: 'InvalidTokenError',
        },
      );
    });

    test('should throw if no stored token is found for the jti', async () => {
      const refreshToken = jwtService.generateRefreshToken(
        DEFAULT_USER_ID.toString(),
        Roles.USER,
      );

      await assert.rejects(
        async () =>
          await authService.refreshToken(
            DEFAULT_USER_ID.toString(),
            refreshToken,
          ),
        {
          name: 'UnauthorizedError',
          message: 'Invalid refresh token',
          code: 'UNAUTHORIZED',
        },
      );
    });

    test('should throw if stored token has been revoked', async () => {
      const refreshToken = jwtService.generateRefreshToken(
        DEFAULT_USER_ID.toString(),
        Roles.USER,
      );
      const decoded = jwtService.verifyToken(refreshToken) as any;

      await fixture.create<RefreshToken>('RefreshToken', {
        userId: DEFAULT_USER_ID,
        jti: decoded.jti,
        expiresAt: new Date(decoded.exp * 1000),
        revokedAt: new Date(),
        replacedByJti: null,
        type: TokenTypes.REFRESH,
      });

      await assert.rejects(
        async () =>
          await authService.refreshToken(
            DEFAULT_USER_ID.toString(),
            refreshToken,
          ),
        {
          name: 'UnauthorizedError',
          message: 'Refresh token has been revoked',
          code: 'UNAUTHORIZED',
        },
      );
    });

    test('should succeed with valid userId and refreshToken', async () => {
      const refreshToken = jwtService.generateRefreshToken(
        DEFAULT_USER_ID.toString(),
        Roles.USER,
      );
      const decoded = jwtService.verifyToken(refreshToken) as any;

      await fixture.create<RefreshToken>('RefreshToken', {
        userId: DEFAULT_USER_ID,
        jti: decoded.jti,
        expiresAt: new Date(decoded.exp * 1000),
        revokedAt: null,
        replacedByJti: null,
        type: TokenTypes.REFRESH,
      });

      const tokens = await authService.refreshToken(
        DEFAULT_USER_ID.toString(),
        refreshToken,
      );

      assert.ok(tokens);
      assert.strictEqual(typeof tokens.accessToken, 'string');
      assert.strictEqual(typeof tokens.refreshToken, 'string');
      assert.ok(JWT_REGEX.test(tokens.accessToken));
      assert.ok(JWT_REGEX.test(tokens.refreshToken));

      const revokedToken = await fixture.findOne<RefreshToken>('RefreshToken', {
        jti: decoded.jti,
      });

      assert.ok(revokedToken);
      assert.ok(revokedToken!.revokedAt);
      assert.ok(revokedToken!.replacedByJti);

      const newToken = await fixture.findOne<RefreshToken>('RefreshToken', {
        userId: DEFAULT_USER_ID,
        revokedAt: null,
      });

      assert.ok(newToken);
      assert.notStrictEqual(newToken!.jti, decoded.jti);
    });

    test('should reject a reused (already revoked) refresh token', async () => {
      const refreshToken = jwtService.generateRefreshToken(
        DEFAULT_USER_ID.toString(),
        Roles.USER,
      );
      const decoded = jwtService.verifyToken(refreshToken) as any;

      await fixture.create<RefreshToken>('RefreshToken', {
        userId: DEFAULT_USER_ID,
        jti: decoded.jti,
        expiresAt: new Date(decoded.exp * 1000),
        revokedAt: null,
        replacedByJti: null,
        type: TokenTypes.REFRESH,
      });

      await authService.refreshToken(DEFAULT_USER_ID.toString(), refreshToken);

      await assert.rejects(
        async () =>
          await authService.refreshToken(
            DEFAULT_USER_ID.toString(),
            refreshToken,
          ),
        {
          name: 'UnauthorizedError',
          message: 'Refresh token has been revoked',
          code: 'UNAUTHORIZED',
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

    test('should revoke all active refresh tokens for the user', async () => {
      const user = await fixture.create<UserInterface>('User');

      const refreshToken1 = jwtService.generateRefreshToken(
        user._id.toString(),
        Roles.USER,
      );
      const decoded1 = jwtService.verifyToken(refreshToken1) as any;

      const refreshToken2 = jwtService.generateRefreshToken(
        user._id.toString(),
        Roles.USER,
      );
      const decoded2 = jwtService.verifyToken(refreshToken2) as any;

      await fixture.createMany<RefreshToken>('RefreshToken', [
        {
          userId: user._id,
          jti: decoded1.jti,
          expiresAt: new Date(decoded1.exp * 1000),
          revokedAt: null,
          replacedByJti: null,
          type: TokenTypes.REFRESH,
        },
        {
          userId: user._id,
          jti: decoded2.jti,
          expiresAt: new Date(decoded2.exp * 1000),
          revokedAt: null,
          replacedByJti: null,
          type: TokenTypes.REFRESH,
        },
      ]);

      await authService.logout(user._id.toString());

      const activeTokens = await fixture.find<RefreshToken>('RefreshToken', {
        userId: user._id,
        revokedAt: null,
      });

      assert.strictEqual(activeTokens.length, 0);

      const allTokens = await fixture.find<RefreshToken>('RefreshToken', {
        userId: user._id,
      });

      assert.strictEqual(allTokens.length, 2);
      assert.ok(allTokens[0]!.revokedAt);
      assert.ok(allTokens[1]!.revokedAt);
    });
  });
});
