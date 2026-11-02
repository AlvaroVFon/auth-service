import { Types } from 'mongoose';

import { Application } from '../../../../../src/applications/applications.interface';
import { ApplicationModel } from '../../../../../src/applications/applications.schema';
import { ApplicationsService } from '../../../../../src/applications/applications.service';
import type { AuditPort } from '../../../../../src/audit';
import { Code, CodeType } from '../../../../../src/auth/codes/code.interface';
import { CodesModel } from '../../../../../src/auth/codes/codes.schema';
import { CodesService } from '../../../../../src/auth/codes/codes.service';
import { AuthMailer } from '../../../../../src/auth/services/auth-mailer';
import { AuthService } from '../../../../../src/auth/services/auth.service';
import { ApplicationTokenService } from '../../../../../src/auth/tokens/application-token.service';
import { BlacklistService } from '../../../../../src/auth/tokens/blacklist.service';
import { BlacklistedTokenModel } from '../../../../../src/auth/tokens/blacklisted-token.schema';
import { RefreshToken } from '../../../../../src/auth/tokens/refresh-token.interface';
import { RefreshTokenModel } from '../../../../../src/auth/tokens/refresh-token.schema';
import { RefreshTokenService } from '../../../../../src/auth/tokens/refresh-token.service';
import { SessionService } from '../../../../../src/auth/tokens/session.service';
import { JWT_REGEX } from '../../../../../src/common/constants/regex';
import { Roles } from '../../../../../src/common/enums/roles.enum';
import { Grant, GrantRoles } from '../../../../../src/grants/grants.interface';
import { GrantModel } from '../../../../../src/grants/grants.schema';
import { GrantsService } from '../../../../../src/grants/grants.service';
import { Holder } from '../../../../../src/holders/holders.interface';
import { HoldersModel } from '../../../../../src/holders/holders.schema';
import { HoldersService } from '../../../../../src/holders/holders.service';
import { CryptoService } from '../../../../../src/libs/crypto/crypto.service';
import { JwtKeyring } from '../../../../../src/libs/jwt';
import { JwtService } from '../../../../../src/libs/jwt/jwt.service';
import { TokenTypes } from '../../../../../src/libs/jwt/token-types.enum';
import { LoggerInterface } from '../../../../../src/libs/logger/logger.interface';
import { User as UserInterface } from '../../../../../src/users/users.interface';
import { User } from '../../../../../src/users/users.schema';
import { UsersService } from '../../../../../src/users/users.service';
import fixture from '../../../../fixtures';
import {
  DEFAULT_USER,
  DEFAULT_USER_ID,
  generateRandomEmail,
} from '../../../../fixtures/defaults';
import { DEFAULT_APPLICATION } from '../../../../fixtures/defaults/applications.default';
import { DEFAULT_HOLDER } from '../../../../fixtures/defaults/holders.default';
import { ApplicationFactory } from '../../../../helpers/factories/application.factory';
import { GrantFactory } from '../../../../helpers/factories/grant.factory';
import { createRsaKeyPair } from '../../../../helpers/jwt-keyring.helper';

describe('Auth Service', () => {
  let authService: AuthService;
  let userService: UsersService;
  let holdersService: HoldersService;
  let codeService: CodesService;
  let refreshTokenService: RefreshTokenService;
  let sessionService: SessionService;
  let blacklistService: BlacklistService;
  let jwtService: JwtService;
  let applicationsService: ApplicationsService;
  let grantsService: GrantsService;
  let applicationTokens: ApplicationTokenService;

  const mockCryptoService = {
    compareString: mock.fn(() => true),
    hashString: mock.fn((str: string) => Promise.resolve(`hashed_${str}`)),
  } as CryptoService;

  const mockAuthMailer = {
    sendSignupVerificationEmail: mock.fn(() => Promise.resolve()),
    sendResetPasswordEmail: mock.fn(() => Promise.resolve()),
  } as unknown as AuthMailer;

  const mockAuditService = {
    record: mock.fn(() => Promise.resolve()),
    list: mock.fn(() => Promise.resolve([])),
  } as unknown as AuditPort;

  const mockLogger: LoggerInterface = {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn(),
    debug: mock.fn(),
  };

  const jwtSecret = process.env.JWT_SECRET;
  const jwtExpiresIn = parseInt(process.env.JWT_EXPIRATION || '3600', 10);
  const refreshTokenExpiresIn = parseInt(
    process.env.JWT_REFRESH_EXPIRES_IN || '86400',
    10,
  );

  beforeEach(async () => {
    mockCryptoService.compareString = mock.fn(async () => true);
    await fixture.create('User');
    await fixture.create('Application');
    await fixture.create('Grant');

    userService = new UsersService(
      User,
      mockCryptoService as unknown as CryptoService,
    );

    jwtService = new JwtService(
      new JwtKeyring([{ ...createRsaKeyPair(), active: true }]),
      jwtExpiresIn,
      refreshTokenExpiresIn,
      {
        issuer: 'auth-service',
        ...(jwtSecret === undefined ? {} : { legacySecret: jwtSecret }),
      },
    );
    codeService = new CodesService(CodesModel);
    holdersService = new HoldersService(
      HoldersModel,
      mockCryptoService as unknown as CryptoService,
    );
    refreshTokenService = new RefreshTokenService(RefreshTokenModel);
    sessionService = new SessionService(jwtService, refreshTokenService);
    blacklistService = new BlacklistService(BlacklistedTokenModel);
    applicationsService = new ApplicationsService(ApplicationModel);
    grantsService = new GrantsService(
      GrantModel,
      applicationsService,
      userService,
    );
    applicationTokens = new ApplicationTokenService(
      jwtService,
      applicationsService,
      grantsService,
      userService,
    );

    authService = new AuthService(
      userService,
      mockAuthMailer,
      codeService,
      sessionService,
      blacklistService,
      holdersService,
      applicationTokens,
      jwtService,
      mockAuditService,
      mockLogger,
    );
  });

  const createApplication = (
    overrides: Partial<Application> = {},
  ): Promise<Application> =>
    ApplicationModel.create(ApplicationFactory.generate(overrides));

  const grantRole = (
    userId: string,
    applicationId: string,
    role: GrantRoles,
  ): Promise<Grant> =>
    GrantModel.create(
      GrantFactory.generate({
        userId: new Types.ObjectId(userId),
        applicationId: new Types.ObjectId(applicationId),
        role,
      }),
    );

  test('should be defined', () => {
    assert.ok(authService);
  });

  describe('login()', () => {
    test('should authenticate user and return tokens', async () => {
      const result = await authService.login({
        email: DEFAULT_USER.email,
        password: 'password123',
        application: DEFAULT_APPLICATION.slug,
      });

      assert.ok(result);
      assert.strictEqual(typeof result.accessToken, 'string');
      assert.strictEqual(typeof result.refreshToken, 'string');
      assert.ok(JWT_REGEX.test(result.accessToken));
      assert.ok(JWT_REGEX.test(result.refreshToken));
    });

    test('should scope tokens to the application and grant role (AC-1)', async () => {
      await fixture.updateOne<Grant>(
        'Grant',
        { applicationId: DEFAULT_APPLICATION._id },
        { role: GrantRoles.EDITOR },
      );

      const result = await authService.login({
        email: DEFAULT_USER.email,
        password: 'password123',
        application: DEFAULT_APPLICATION.slug,
      });

      const access = jwtService.verifyToken(result.accessToken, {
        audience: DEFAULT_APPLICATION.audience,
      });
      const refresh = jwtService.verifyToken(result.refreshToken, {
        audience: DEFAULT_APPLICATION.audience,
      });

      assert.strictEqual(access.aud, DEFAULT_APPLICATION.audience);
      assert.strictEqual(access.role, GrantRoles.EDITOR);
      assert.strictEqual(refresh.aud, DEFAULT_APPLICATION.audience);
      assert.strictEqual(refresh.role, GrantRoles.EDITOR);
    });

    test('should accept the application audience as identifier', async () => {
      const result = await authService.login({
        email: DEFAULT_USER.email,
        password: 'password123',
        application: DEFAULT_APPLICATION.audience,
      });

      const access = jwtService.verifyToken(result.accessToken, {
        audience: DEFAULT_APPLICATION.audience,
      });

      assert.strictEqual(access.aud, DEFAULT_APPLICATION.audience);
    });

    test('should reject a user without a grant on the app (AC-2)', async () => {
      const otherApplication = await createApplication({
        slug: 'other-app',
        audience: 'other-audience',
      });
      await fixture.deleteOne<Grant>('Grant', {
        userId: DEFAULT_USER_ID,
        applicationId: otherApplication._id,
      });

      await assert.rejects(
        authService.login({
          email: DEFAULT_USER.email,
          password: 'password123',
          application: otherApplication.slug,
        }),
        {
          name: 'ForbiddenError',
          message: 'User has no access to this application',
          code: 'FORBIDDEN',
        },
      );
    });

    test('should issue the role of each application (AC-3)', async () => {
      const appA = await createApplication({
        slug: 'app-a',
        audience: 'audience-a',
      });
      const appB = await createApplication({
        slug: 'app-b',
        audience: 'audience-b',
      });
      await fixture.deleteOne<Grant>('Grant', {
        userId: DEFAULT_USER_ID,
      });
      await grantRole(
        DEFAULT_USER_ID.toString(),
        appA._id.toString(),
        GrantRoles.VIEWER,
      );
      await grantRole(
        DEFAULT_USER_ID.toString(),
        appB._id.toString(),
        GrantRoles.ADMIN,
      );

      const tokensA = await authService.login({
        email: DEFAULT_USER.email,
        password: 'password123',
        application: appA.slug,
      });
      const tokensB = await authService.login({
        email: DEFAULT_USER.email,
        password: 'password123',
        application: appB.slug,
      });

      assert.strictEqual(
        jwtService.verifyToken(tokensA.accessToken, {
          audience: appA.audience,
        }).role,
        GrantRoles.VIEWER,
      );
      assert.strictEqual(
        jwtService.verifyToken(tokensB.accessToken, {
          audience: appB.audience,
        }).role,
        GrantRoles.ADMIN,
      );
    });

    test('should keep a generic 401 for invalid credentials with an application (AC-4)', async () => {
      mockCryptoService.compareString = mock.fn(async () => false);

      await assert.rejects(
        authService.login({
          email: DEFAULT_USER.email,
          password: 'wrongpassword',
          application: DEFAULT_APPLICATION.slug,
        }),
        {
          name: 'InvalidCredentialsError',
          message: 'Invalid email or password',
        },
      );
    });

    test('should allow the global owner to log in without an application', async () => {
      const owner = await fixture.create<UserInterface>('User', {
        email: generateRandomEmail('owner-login'),
        role: Roles.OWNER,
        verified: true,
      });

      const result = await authService.login({
        email: owner.email,
        password: 'password123',
      });

      const access = jwtService.verifyToken(result.accessToken);

      assert.strictEqual(access.aud, undefined);
      assert.strictEqual(access.role, Roles.OWNER);
    });

    test('should reject a regular user without an application', async () => {
      await assert.rejects(
        authService.login({
          email: DEFAULT_USER.email,
          password: 'password123',
        }),
        {
          name: 'ForbiddenError',
          message: 'An application is required',
          code: 'FORBIDDEN',
        },
      );
    });

    test('should authenticate regardless of email casing and spaces', async () => {
      const email = generateRandomEmail('login-normalize');
      await fixture.create<UserInterface>('User', { email });

      const result = await authService.login({
        email: `  ${email.toUpperCase()} `,
        password: 'password123',
        application: DEFAULT_APPLICATION.slug,
      });

      assert.ok(result.accessToken);
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

    test('should reject a non-string email as invalid input', async () => {
      await assert.rejects(
        async () =>
          await authService.login({
            email: 123 as unknown as string,
            password: 'password123',
          }),
        {
          name: 'InvalidArgumentError',
          message: 'Invalid email or password',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should reject an unverified user', async () => {
      await fixture.updateOne<UserInterface>(
        'User',
        { _id: DEFAULT_USER_ID },
        { verified: false },
      );

      await assert.rejects(
        async () =>
          await authService.login({
            email: DEFAULT_USER.email,
            password: 'password123',
          }),
        {
          name: 'ForbiddenError',
          message: 'Email is not verified',
          code: 'FORBIDDEN',
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
      userService = new UsersService(
        User,
        mockCryptoService as unknown as CryptoService,
        MAX_LOGIN_ATTEMPTS,
        LOCKOUT_DURATION_MS,
      );
      authService = new AuthService(
        userService,
        mockAuthMailer,
        codeService,
        sessionService,
        blacklistService,
        holdersService,
        applicationTokens,
        jwtService,
        mockAuditService,
        mockLogger,
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
        application: DEFAULT_APPLICATION.slug,
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
        application: DEFAULT_APPLICATION.slug,
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

    test('should throw an error if a verified user already owns the email', async () => {
      const email = generateRandomEmail('existinguser+');
      await fixture.create<UserInterface>('User', { email, verified: true });

      await assert.rejects(
        async () =>
          await authService.signup({
            email,
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
        mockAuthMailer.sendSignupVerificationEmail.mock.calls.length === 1,
      );
      const code = await fixture.findOne<Code>('Code', {
        subjectId: holder._id,
        type: CodeType.SIGNUP,
      });

      assert.deepStrictEqual(
        // @ts-expect-error mock.call exists
        mockAuthMailer.sendSignupVerificationEmail.mock.calls[0].arguments,
        [email, holder._id.toString(), code!.code],
      );
    });

    test('should normalize the email before storing the holder', async () => {
      const email = generateRandomEmail('signup-normalize');
      const holder = await authService.signup({
        email: `  ${email.toUpperCase()} `,
        password: 'ValidPass123!',
        passwordConfirmation: 'ValidPass123!',
      });

      assert.strictEqual(holder.email, email);
    });

    test('should clean up holder and code when verification email fails', async () => {
      const email = generateRandomEmail('mail-failure+');
      // @ts-expect-error Node test mocks expose mock at runtime.
      mockAuthMailer.sendSignupVerificationEmail.mock.mockImplementation(
        async () => {
          throw new Error('SMTP down');
        },
      );

      await assert.rejects(
        authService.signup({
          email,
          password: 'Password123!',
          passwordConfirmation: 'Password123!',
        }),
        new Error('SMTP down'),
      );

      assert.strictEqual(await fixture.findOne('Holder', { email }), null);
      assert.strictEqual((await fixture.find<Code>('Code', {})).length, 0);
    });
  });

  describe('validateSignupVerificationCode()', () => {
    test('should verify holder with valid code', async () => {
      const holder = await fixture.create<Holder>('Holder');
      const code = await fixture.create<Code>('Code', {
        subjectId: holder._id,
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

    test('should reject a non-string email as invalid input', async () => {
      await assert.rejects(
        async () => await authService.forgotPassword(123 as unknown as string),
        {
          name: 'InvalidArgumentError',
          message: 'email has invalid format',
          code: 'INVALID_ARGUMENT',
        },
      );
    });

    test('should not reveal whether the user exists', async () => {
      const email = generateRandomEmail('auth+');
      const callsBefore = (
        mockAuthMailer.sendResetPasswordEmail as unknown as {
          mock: { calls: unknown[] };
        }
      ).mock.calls.length;

      await authService.forgotPassword(email);

      const callsAfter = (
        mockAuthMailer.sendResetPasswordEmail as unknown as {
          mock: { calls: unknown[] };
        }
      ).mock.calls.length;

      assert.strictEqual(callsAfter, callsBefore);
    });

    test('on yellow brick road', async () => {
      const email = generateRandomEmail('forgot-password');
      const user = await fixture.create<UserInterface>('User', { email });

      await authService.forgotPassword(email);

      // @ts-expect-error mock.call exists
      assert(mockAuthMailer.sendResetPasswordEmail.mock.calls.length === 1);

      const code = await fixture.findOne<Code>('Code', {
        subjectId: user._id.toString(),
        used: false,
      });

      assert.deepStrictEqual(
        // @ts-expect-error mock.call exists
        mockAuthMailer.sendResetPasswordEmail.mock.calls[0].arguments,
        [email, user._id.toString(), code!.code],
      );
    });

    test('should normalize the email before looking up the user', async () => {
      const email = generateRandomEmail('forgot-normalize');
      const user = await fixture.create<UserInterface>('User', { email });

      await authService.forgotPassword(`  ${email.toUpperCase()} `);

      const calls = (
        mockAuthMailer.sendResetPasswordEmail as unknown as {
          mock: { calls: { arguments: unknown[] }[] };
        }
      ).mock.calls;
      const lastCall = calls[calls.length - 1];

      assert.strictEqual(lastCall?.arguments[0], email);
      assert.strictEqual(lastCall?.arguments[1], user._id.toString());
    });

    test('should resend an existing valid reset code', async () => {
      const email = generateRandomEmail('forgot-resend');
      const user = await fixture.create<UserInterface>('User', { email });
      const mailCalls = () =>
        (
          mockAuthMailer.sendResetPasswordEmail as unknown as {
            mock: { calls: { arguments: unknown[] }[] };
          }
        ).mock.calls;

      await authService.forgotPassword(email);
      const code = await fixture.findOne<Code>('Code', {
        subjectId: user._id.toString(),
        used: false,
      });
      const callsBefore = mailCalls().length;

      await authService.forgotPassword(email);
      const calls = mailCalls();

      assert.strictEqual(calls.length, callsBefore + 1);
      assert.strictEqual(calls[calls.length - 1]?.arguments[2], code!.code);
    });

    test('should not fail when the reset email cannot be sent', async () => {
      const email = generateRandomEmail('forgot-mail-failure');
      const user = await fixture.create<UserInterface>('User', { email });
      const mailMock = mockAuthMailer.sendResetPasswordEmail as unknown as {
        mock: { mockImplementation(fn: () => Promise<void>): void };
      };

      mailMock.mock.mockImplementation(async () => {
        throw new Error('SMTP down');
      });

      try {
        await assert.doesNotReject(authService.forgotPassword(email));

        const subjectId = user._id.toString();
        const codeRemoved = async () =>
          (await fixture.findOne<Code>('Code', {
            subjectId,
            used: false,
          })) === null;

        for (
          let attempt = 0;
          attempt < 20 && !(await codeRemoved());
          attempt++
        ) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        assert.ok(await codeRemoved());
        assert.ok(
          (
            mockLogger.warn as unknown as {
              mock: { calls: unknown[] };
            }
          ).mock.calls.length >= 1,
        );
      } finally {
        mailMock.mock.mockImplementation(async () => {});
      }
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
        subjectId: user._id,
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

    test('should revoke refresh tokens issued before a password reset', async () => {
      const user = await fixture.create<UserInterface>('User');
      await fixture.updateOne<UserInterface>(
        'User',
        { _id: user._id },
        { role: Roles.OWNER },
      );
      const refreshToken = jwtService.signTokenPair(
        user._id.toString(),
        Roles.USER,
      ).refreshToken;
      const decoded = jwtService.verifyToken(refreshToken) as any;
      await fixture.create<RefreshToken>('RefreshToken', {
        userId: user._id,
        jti: decoded.jti,
        expiresAt: new Date(decoded.exp * 1000),
        revokedAt: null,
        replacedByJti: null,
        type: TokenTypes.REFRESH,
      });
      const code = await fixture.create<Code>('Code', {
        subjectId: user._id,
        type: CodeType.RESET_PASSWORD,
        used: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

      await authService.resetPassword(
        user._id.toString(),
        code.code,
        'NewPass123!',
        'NewPass123!',
      );

      await assert.rejects(authService.refreshToken(refreshToken), {
        name: 'UnauthorizedError',
      });
    });

    test('should hash the new password when resetting password', async () => {
      const user = await fixture.create<UserInterface>('User');
      const code = await fixture.create<Code>('Code', {
        subjectId: user._id,
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

    test('should delegate the password change to setPassword', async () => {
      const user = await fixture.create<UserInterface>('User');
      const code = await fixture.create<Code>('Code', {
        subjectId: user._id,
        type: CodeType.RESET_PASSWORD,
        used: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const newPassword = 'NewPass123!';

      const setPasswordSpy = mock.method(userService, 'setPassword');

      await authService.resetPassword(
        user._id.toString(),
        code.code,
        newPassword,
        newPassword,
      );

      assert.ok(setPasswordSpy.mock.calls.length === 1);
      assert.deepStrictEqual(setPasswordSpy.mock.calls[0].arguments, [
        user._id.toString(),
        newPassword,
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
    const makeOwner = (
      userId: Types.ObjectId | string = DEFAULT_USER_ID,
    ): Promise<void> =>
      fixture.updateOne<UserInterface>(
        'User',
        { _id: userId },
        { role: Roles.OWNER },
      );

    test('should reject a global refresh token from a non-owner', async () => {
      const refreshToken = jwtService.signTokenPair(
        DEFAULT_USER_ID.toString(),
        Roles.USER,
      ).refreshToken;

      await assert.rejects(authService.refreshToken(refreshToken), {
        name: 'ForbiddenError',
        message: 'An application is required',
        code: 'FORBIDDEN',
      });
    });
    test('should throw an error if no refreshToken is provided', async () => {
      await assert.rejects(async () => await authService.refreshToken(''), {
        name: 'InvalidArgumentError',
        message: 'refreshToken is required',
        code: 'INVALID_ARGUMENT',
      });
    });

    test('should throw if JWT is invalid', async () => {
      await makeOwner();
      await assert.rejects(
        async () => await authService.refreshToken('not-a-jwt'),
        {
          name: 'InvalidTokenError',
        },
      );
    });

    test('should throw if no stored token is found for the jti', async () => {
      await makeOwner();
      const refreshToken = jwtService.signTokenPair(
        DEFAULT_USER_ID.toString(),
        Roles.USER,
      ).refreshToken;

      await assert.rejects(
        async () => await authService.refreshToken(refreshToken),
        {
          name: 'UnauthorizedError',
          message: 'Invalid refresh token',
          code: 'UNAUTHORIZED',
        },
      );
    });

    test('should throw if stored token has been revoked', async () => {
      await makeOwner();
      const refreshToken = jwtService.signTokenPair(
        DEFAULT_USER_ID.toString(),
        Roles.USER,
      ).refreshToken;
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
        async () => await authService.refreshToken(refreshToken),
        {
          name: 'UnauthorizedError',
          message: 'Refresh token has been revoked',
          code: 'UNAUTHORIZED',
        },
      );
    });

    test('should reject a refresh for an unverified user', async () => {
      await fixture.updateOne<UserInterface>(
        'User',
        { _id: DEFAULT_USER_ID },
        { verified: false },
      );

      const refreshToken = jwtService.signTokenPair(
        DEFAULT_USER_ID.toString(),
        Roles.USER,
      ).refreshToken;
      const decoded = jwtService.verifyToken(refreshToken) as any;

      await fixture.create<RefreshToken>('RefreshToken', {
        userId: DEFAULT_USER_ID,
        jti: decoded.jti,
        expiresAt: new Date(decoded.exp * 1000),
        revokedAt: null,
        replacedByJti: null,
        type: TokenTypes.REFRESH,
      });

      await assert.rejects(
        async () => await authService.refreshToken(refreshToken),
        {
          name: 'ForbiddenError',
          message: 'Email is not verified',
          code: 'FORBIDDEN',
        },
      );
    });

    test('should rotate a valid refresh token', async () => {
      await makeOwner();
      const refreshToken = jwtService.signTokenPair(
        DEFAULT_USER_ID.toString(),
        Roles.USER,
      ).refreshToken;
      const decoded = jwtService.verifyToken(refreshToken) as any;

      await fixture.create<RefreshToken>('RefreshToken', {
        userId: DEFAULT_USER_ID,
        jti: decoded.jti,
        expiresAt: new Date(decoded.exp * 1000),
        revokedAt: null,
        replacedByJti: null,
        type: TokenTypes.REFRESH,
      });

      const tokens = await authService.refreshToken(refreshToken);

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

    test('should keep the application scope when refreshing', async () => {
      const login = await authService.login({
        email: DEFAULT_USER.email,
        password: 'password123',
        application: DEFAULT_APPLICATION.slug,
      });

      const refreshed = await authService.refreshToken(login.refreshToken);

      const access = jwtService.verifyToken(refreshed.accessToken, {
        audience: DEFAULT_APPLICATION.audience,
      });
      const refresh = jwtService.verifyToken(refreshed.refreshToken, {
        audience: DEFAULT_APPLICATION.audience,
      });

      assert.strictEqual(access.aud, DEFAULT_APPLICATION.audience);
      assert.strictEqual(access.role, GrantRoles.VIEWER);
      assert.strictEqual(refresh.aud, DEFAULT_APPLICATION.audience);
    });

    test('should re-derive the grant role on refresh', async () => {
      const login = await authService.login({
        email: DEFAULT_USER.email,
        password: 'password123',
        application: DEFAULT_APPLICATION.slug,
      });
      await fixture.updateOne<Grant>(
        'Grant',
        { userId: DEFAULT_USER_ID, applicationId: DEFAULT_APPLICATION._id },
        { role: GrantRoles.ADMIN },
      );

      const refreshed = await authService.refreshToken(login.refreshToken);

      assert.strictEqual(
        jwtService.verifyToken(refreshed.accessToken, {
          audience: DEFAULT_APPLICATION.audience,
        }).role,
        GrantRoles.ADMIN,
      );
    });

    test('should reject a refresh when the grant was revoked', async () => {
      const login = await authService.login({
        email: DEFAULT_USER.email,
        password: 'password123',
        application: DEFAULT_APPLICATION.slug,
      });
      await fixture.deleteOne<Grant>('Grant', { userId: DEFAULT_USER_ID });

      await assert.rejects(authService.refreshToken(login.refreshToken), {
        name: 'ForbiddenError',
        message: 'User has no access to this application',
      });

      await grantsService.assignRole({
        userId: DEFAULT_USER_ID.toString(),
        applicationId: DEFAULT_APPLICATION._id.toString(),
        role: GrantRoles.VIEWER,
      });

      // Restoring the grant must not resurrect the revoked session.
      await assert.rejects(authService.refreshToken(login.refreshToken), {
        name: 'UnauthorizedError',
        message: 'Refresh token has been revoked',
      });
    });

    test('should reject a refresh when the application is inactive', async () => {
      const login = await authService.login({
        email: DEFAULT_USER.email,
        password: 'password123',
        application: DEFAULT_APPLICATION.slug,
      });
      await fixture.updateOne<Application>(
        'Application',
        { _id: DEFAULT_APPLICATION._id },
        { active: false },
      );

      await assert.rejects(authService.refreshToken(login.refreshToken), {
        name: 'ForbiddenError',
        message: 'User has no access to this application',
      });

      await fixture.updateOne<Application>(
        'Application',
        { _id: DEFAULT_APPLICATION._id },
        { active: true },
      );

      await assert.rejects(authService.refreshToken(login.refreshToken), {
        name: 'UnauthorizedError',
        message: 'Refresh token has been revoked',
      });
    });

    test('should reject a reused (already revoked) refresh token', async () => {
      await makeOwner();
      const refreshToken = jwtService.signTokenPair(
        DEFAULT_USER_ID.toString(),
        Roles.USER,
      ).refreshToken;
      const decoded = jwtService.verifyToken(refreshToken) as any;

      await fixture.create<RefreshToken>('RefreshToken', {
        userId: DEFAULT_USER_ID,
        jti: decoded.jti,
        expiresAt: new Date(decoded.exp * 1000),
        revokedAt: null,
        replacedByJti: null,
        type: TokenTypes.REFRESH,
      });

      await authService.refreshToken(refreshToken);

      await assert.rejects(
        async () => await authService.refreshToken(refreshToken),
        {
          name: 'UnauthorizedError',
          message: 'Refresh token has been revoked',
          code: 'UNAUTHORIZED',
        },
      );
    });

    test('should allow only one concurrent refresh rotation', async () => {
      const user = await fixture.create<UserInterface>('User');
      await makeOwner(user._id);
      const refreshToken = jwtService.signTokenPair(
        user._id.toString(),
        Roles.USER,
      ).refreshToken;
      const decoded = jwtService.verifyToken(refreshToken) as any;
      await fixture.create<RefreshToken>('RefreshToken', {
        userId: user._id,
        jti: decoded.jti,
        expiresAt: new Date(decoded.exp * 1000),
        revokedAt: null,
        replacedByJti: null,
        type: TokenTypes.REFRESH,
      });

      const results = await Promise.allSettled([
        authService.refreshToken(refreshToken),
        authService.refreshToken(refreshToken),
      ]);

      assert.strictEqual(
        results.filter((result) => result.status === 'fulfilled').length,
        1,
      );
      assert.strictEqual(
        results.filter((result) => result.status === 'rejected').length,
        1,
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

      const refreshToken1 = jwtService.signTokenPair(
        user._id.toString(),
        Roles.USER,
      ).refreshToken;
      const decoded1 = jwtService.verifyToken(refreshToken1) as any;

      const refreshToken2 = jwtService.signTokenPair(
        user._id.toString(),
        Roles.USER,
      ).refreshToken;
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
