import { InvalidCredentialsError } from '../../../../src/common/exceptions/auth.exceptions';
import { AuthService } from '../../../../src/auth/auth.service';
import { CryptoService } from '../../../../src/libs/crypto/crypto.service';
import { JwtService } from '../../../../src/libs/jwt/jwt.service';
import { UsersService } from '../../../../src/users/users.service';
import { DEFAULT_USER, generateRandomEmail } from '../../../fixtures/defaults';
import fixture from '../../../fixtures/fixture';
import { User } from '../../../../src/users/users.schema';
import { Types } from 'mongoose';

describe('Auth Service', () => {
  let authService: AuthService;
  let userService: UsersService;
  const mockCryptoService = {
    compareString: mock.fn(() => true),
    hashString: mock.fn((str: string) => Promise.resolve(`hashed_${str}`)),
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

    authService = new AuthService(
      userService,
      mockCryptoService as unknown as CryptoService,
      jwtService as JwtService,
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
    });
  });
});
