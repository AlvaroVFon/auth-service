import { Types } from 'mongoose';

import { Roles } from '../../../../../src/common/enums/roles.enum';
import { InvalidArgumentError } from '../../../../../src/common/exceptions/base.exception';
import {
  TenantPayload,
  TokenClaims,
} from '../../../../../src/libs/jwt/jwt.interfaces';
import { JwtService } from '../../../../../src/libs/jwt/jwt.service';
import { TokenTypes } from '../../../../../src/libs/jwt/token-types.enum';

describe('JwtService', () => {
  let jwtService: JwtService;
  const jwtSecret = process.env.JWT_SECRET!;
  const jwtExpiresIn = parseInt(process.env.JWT_EXPIRATION || '3600', 10);
  const jwtRefreshExpiresIn = parseInt(
    process.env.JWT_REFRESH_EXPIRES_IN || '86400',
    10,
  );

  beforeEach(() => {
    jwtService = new JwtService(jwtSecret, jwtExpiresIn, jwtRefreshExpiresIn);
  });

  describe('issueSession', () => {
    test('should throw an error when userId is not a valid ObjectId', () => {
      try {
        jwtService.issueSession('invalid-object-id', Roles.USER);
        throw new Error('Test failed: Expected error was not thrown');
      } catch (error) {
        assert.ok(error instanceof InvalidArgumentError);
        assert.strictEqual(
          (error as InvalidArgumentError).message,
          'InvalidArgumentError: Payload userId is not a valid ObjectId',
        );
      }
    });

    test('should return a token pair with jti and refresh metadata', () => {
      const session = jwtService.issueSession('0'.repeat(24), Roles.USER);
      const access = jwtService.verifyToken(session.accessToken);
      const refresh = jwtService.verifyToken(session.refreshToken);

      assert.ok(session.refreshExpiresAt instanceof Date);
      assert.strictEqual(access.type, TokenTypes.ACCESS);
      assert.ok(access.jti);
      assert.strictEqual(refresh.type, TokenTypes.REFRESH);
      assert.strictEqual(session.refreshTokenId, refresh.jti);
    });

    test('should sign refresh tokens with the refresh token expiry', () => {
      const accessExpiresIn = 1000;
      const refreshExpiresIn = 5000;
      const service = new JwtService(
        jwtSecret,
        accessExpiresIn,
        refreshExpiresIn,
      );
      const session = service.issueSession('0'.repeat(24), Roles.USER);
      const decoded = service.verifyToken(
        session.refreshToken,
      ) as TokenClaims & {
        iat: number;
      };

      assert.strictEqual(decoded.exp - decoded.iat, refreshExpiresIn);
    });
  });

  describe('verifyToken', () => {
    test('should verify a valid JWT token', () => {
      const session = jwtService.issueSession('0'.repeat(24), Roles.USER);
      const claims = jwtService.verifyToken(session.accessToken);

      assert.strictEqual(claims.userId, '0'.repeat(24));
      assert.strictEqual(claims.role, Roles.USER);
      assert.strictEqual(claims.type, TokenTypes.ACCESS);
      assert.ok(claims.jti);
      assert.ok(claims.exp > 0);
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

  describe('generateTenantToken', () => {
    test('should generate a valid tenant token', () => {
      const tenantId = new Types.ObjectId();
      const token = jwtService.generateTenantToken(String(tenantId));

      assert.ok(token);
      assert.strictEqual(typeof token, 'string');

      const decoded = jwtService.verifyToken(token) as TenantPayload & {
        iat: number;
        exp: number;
      };

      assert.strictEqual(decoded.tenantId, String(tenantId));
      assert.strictEqual(decoded.type, TokenTypes.ACCESS);
    });

    test('should throw an error when tenantId is not a valid ObjectId', () => {
      assert.throws(
        () => jwtService.generateTenantToken('invalid-tenant-id'),
        InvalidArgumentError,
      );
    });
  });
});
