import { InvalidArgumentError } from '../../../../../src/common/exceptions/base.exception';
import { Payload } from '../../../../../src/libs/jwt/jwt.interfaces';
import { JwtService } from '../../../../../src/libs/jwt/jwt.service';

describe('JwtService', () => {
  let jwtService: JwtService;
  const jwtSecret = process.env.JWT_SECRET!;
  const jwtExpiresIn = parseInt(process.env.JWT_EXPIRES_IN || '3600', 10);

  beforeEach(() => {
    jwtService = new JwtService(jwtSecret, jwtExpiresIn);
  });

  describe('generateToken', () => {
    test('should throw an error when payload id is not a valid ObjectId', () => {
      const invalidPayload: Payload = { userId: 'invalid-object-id', type: 'access' };
      try {
        jwtService.generateToken(invalidPayload);
        throw new Error('Test failed: Expected error was not thrown');
      } catch (error) {
        assert.ok(error instanceof InvalidArgumentError);
        assert.strictEqual(
          (error as InvalidArgumentError).message,
          'InvalidArgumentError: Payload userId is not a valid ObjectId',
        );
      }
    });

    test('should throw an error when payload is missing token type', () => {
      const invalidPayload: any = { userId: '0'.repeat(24) };
      try {
        jwtService.generateToken(invalidPayload);
        throw new Error('Test failed: Expected error was not thrown');
      } catch (error) {
        assert.ok(error instanceof InvalidArgumentError);
        assert.strictEqual(
          (error as InvalidArgumentError).message,
          'InvalidArgumentError: Payload type is not valid',
        );
      }
    });

    test('should generate a valid JWT token', () => {
      const payload: Payload = { userId: '0'.repeat(24), type: 'access' };
      const token = jwtService.generateToken(payload);
      assert.ok(token);
      assert.strictEqual(typeof token, 'string');
    });
  });

  describe('verifyToken', () => {
    test('should verify a valid JWT token', () => {
      const payload: Payload = { userId: '0'.repeat(24), type: 'access' };
      const token = jwtService.generateToken(payload);
      const isValid = jwtService.verifyToken(token);
      assert.deepStrictEqual(isValid, {
        userId: payload.userId,
        type: payload.type,
        // @ts-expect-error 'iat' and 'exp' are added by jsonwebtoken
        iat: isValid['iat'],
        // @ts-expect-error 'iat' and 'exp' are added by jsonwebtoken
        exp: isValid['exp'],
      });
    });

    test('should throw an error for an invalid JWT token', () => {
      const invalidToken = 'invalid.token.here';
      try {
        jwtService.verifyToken(invalidToken);
        throw new Error('Test failed: Expected error was not thrown');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.strictEqual((error as Error).name, 'InvalidTokenError');
        assert.strictEqual(
          (error as Error).message,
          'InvalidTokenError: Token is invalid or has expired',
        );
      }
    });
  });

  describe('generateAccessToken', () => {
    test('should generate a valid access token', () => {
      const userId = '0'.repeat(24);
      const token = jwtService.generateAccessToken(userId);
      assert.ok(token);
      assert.strictEqual(typeof token, 'string');

      const decoded = jwtService.verifyToken(token) as Payload & { iat: number; exp: number };
      assert.strictEqual(decoded.userId, userId);
      assert.strictEqual(decoded.type, 'access');
    });
  });
});
