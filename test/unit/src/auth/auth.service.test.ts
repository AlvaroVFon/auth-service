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

  const jwtSecret = process.env.JWT_SECRET;
  const jwtExpiresIn = parseInt(process.env.JWT_EXPIRES_IN || '3600', 10);

  before(async () => {
    await fixture.create('User');
    const mockCryptoService = {
      async compareString(plainText: string, hashedString: string): Promise<boolean> {
        // In tests, we assume the password is always 'password123' for DEFAULT_USER
        if (plainText === 'password123' && hashedString === DEFAULT_USER.password) {
          return true;
        }
        return false;
      },
    } as unknown as CryptoService;
    const mockUserService = {
      async findByEmail(email: string): Promise<User | null> {
        if (email === DEFAULT_USER.email) {
          return DEFAULT_USER as User;
        }
        return null;
      },
    } as unknown as UsersService;
    const jwtService = new JwtService(jwtSecret!, jwtExpiresIn);
    authService = new AuthService(mockUserService, mockCryptoService, jwtService);
  });

  test('should be defined', () => {
    assert.ok(authService);
  });

  describe('login()', () => {
    test('should authenticate user and return a token', async () => {
      const jwtRegex = /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/;
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
        assert.strictEqual((error as InvalidCredentialsError).message, 'Invalid email or password');
      }
    });

    test('should throw an error for invalid password', async () => {
      try {
        await authService.login({
          email: DEFAULT_USER.email,
          password: 'wrongpassword',
        });
        throw new Error('Test failed: Expected error was not thrown');
      } catch (error) {
        assert.ok(error);
        assert.ok(error instanceof InvalidCredentialsError);
        assert.strictEqual((error as InvalidCredentialsError).message, 'Invalid email or password');
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
        assert.strictEqual((error as InvalidCredentialsError).message, 'Invalid email or password');
      }
    });
  });
});
