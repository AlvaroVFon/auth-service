import { mock } from 'node:test';
import { InvalidCredentialsError } from '../../../../src/auth/auth.errors';
import { AuthService } from '../../../../src/auth/auth.servive';
import { CryptoService } from '../../../../src/libs/crypto/crypto.service';
import { JwtService } from '../../../../src/libs/jwt/jwt.service';
import { User } from '../../../../src/users/users.interface';
import { UsersService } from '../../../../src/users/users.service';
import { DEFAULT_USER } from '../../../fixtures/defaults';
import fixture from '../../../fixtures/fixture';

describe('Auth Service', () => {
  let authService: AuthService;
  const mockCryptoService = { compareString: mock.fn(() => true) };

  const jwtSecret = process.env.JWT_SECRET;
  const jwtExpiresIn = parseInt(process.env.JWT_EXPIRES_IN || '3600', 10);

  beforeEach(async () => {
    await fixture.create('User');

    const mockUserService = {
      async findByEmail(email: string): Promise<User | null> {
        return email === DEFAULT_USER.email ? (DEFAULT_USER as User) : null;
      },
    };

    const jwtService = new JwtService(jwtSecret!, jwtExpiresIn);

    authService = new AuthService(
      mockUserService as UsersService,
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

    test('should throw an error for invalid email', async () => {
      try {
        await authService.login({
          email: 'invalid@example.com',
          password: 'wrongpassword',
        });
        throw new Error('Test failed: Expected error was not thrown');
      } catch (error) {
        assert.ok(error);
        assert.ok(error instanceof InvalidCredentialsError);
        assert.strictEqual(
          (error as InvalidCredentialsError).message,
          'Invalid email or password',
        );
      }
    });

    test('should throw an error for invalid password', async () => {
      mockCryptoService.compareString = mock.fn(() => false);
      try {
        await authService.login({
          email: DEFAULT_USER.email,
          password: 'wrongpassword',
        });
        throw new Error('Test failed: Expected error was not thrown');
      } catch (error) {
        assert.ok(error);
        assert.ok(error instanceof InvalidCredentialsError);
        assert.strictEqual(
          (error as InvalidCredentialsError).message,
          'Invalid email or password',
        );
      }
    });

    test('should throw an error for empty credentials', async () => {
      try {
        await authService.login({
          email: '',
          password: '',
        });
        throw new Error('Test failed: Expected error was not thrown');
      } catch (error) {
        assert.ok(error);
        assert.ok(error instanceof InvalidCredentialsError);
        assert.strictEqual(
          (error as InvalidCredentialsError).message,
          'Invalid email or password',
        );
      }
    });
  });
});
