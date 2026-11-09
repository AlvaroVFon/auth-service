import jwt from 'jsonwebtoken';

import { Roles } from '../../../../../src/common/enums/roles.enum';
import { InvalidArgumentError } from '../../../../../src/common/exceptions/base.exception';
import { GrantRoles } from '../../../../../src/grants/grants.interface';
import { JwtKeyring } from '../../../../../src/libs/jwt/jwt-keyring';
import { TokenClaims } from '../../../../../src/libs/jwt/jwt.interfaces';
import { JwtService } from '../../../../../src/libs/jwt/jwt.service';
import { TokenTypes } from '../../../../../src/libs/jwt/token-types.enum';
import { createRsaKeyPair } from '../../../../helpers/jwt-keyring.helper';

describe('JwtService', () => {
  const userId = '0'.repeat(24);
  const jwtSecret = process.env.JWT_SECRET!;
  const jwtExpiresIn = parseInt(process.env.JWT_EXPIRATION || '3600', 10);
  const jwtRefreshExpiresIn = parseInt(
    process.env.JWT_REFRESH_EXPIRES_IN || '86400',
    10,
  );

  let keyring: JwtKeyring;
  let jwtService: JwtService;

  beforeEach(() => {
    keyring = new JwtKeyring([{ ...createRsaKeyPair(), active: true }]);
    jwtService = new JwtService(keyring, jwtExpiresIn, jwtRefreshExpiresIn, {
      issuer: 'auth-service-test',
      legacySecret: jwtSecret,
    });
  });

  describe('signTokenPair', () => {
    test('should throw an error when userId is not a valid ObjectId', () => {
      assert.throws(
        () => jwtService.signTokenPair('invalid-object-id', Roles.USER),
        (error: unknown) =>
          error instanceof InvalidArgumentError &&
          error.message ===
            'InvalidArgumentError: Payload userId is not a valid ObjectId',
      );
    });

    test('should return a token pair with jti and refresh metadata', () => {
      const session = jwtService.signTokenPair(userId, Roles.USER);
      const access = jwtService.verifyToken(session.accessToken);
      const refresh = jwtService.verifyToken(session.refreshToken);

      assert.ok(session.refreshExpiresAt instanceof Date);
      assert.strictEqual(access.type, TokenTypes.ACCESS);
      assert.ok(access.jti);
      assert.strictEqual(refresh.type, TokenTypes.REFRESH);
      assert.strictEqual(session.refreshTokenId, refresh.jti);
    });

    test('should scope both tokens with the session audience', () => {
      const session = jwtService.signTokenPair(
        userId,
        GrantRoles.EDITOR,
        'app-audience',
      );
      const access = jwtService.verifyToken(session.accessToken, {
        audience: 'app-audience',
      });
      const refresh = jwtService.verifyToken(session.refreshToken, {
        audience: 'app-audience',
      });

      assert.strictEqual(access.aud, 'app-audience');
      assert.strictEqual(refresh.aud, 'app-audience');
      assert.strictEqual(access.role, GrantRoles.EDITOR);
      assert.strictEqual(refresh.role, GrantRoles.EDITOR);
      assert.strictEqual(session.refreshTokenId, refresh.jti);
    });

    test('should omit the audience when none is provided', () => {
      const session = jwtService.signTokenPair(userId, Roles.USER);
      const access = jwtService.verifyToken(session.accessToken);
      const refresh = jwtService.verifyToken(session.refreshToken);

      assert.strictEqual(access.aud, undefined);
      assert.strictEqual(refresh.aud, undefined);
    });

    test('should sign refresh tokens with the refresh token expiry', () => {
      const accessExpiresIn = 1000;
      const refreshExpiresIn = 5000;
      const service = new JwtService(
        keyring,
        accessExpiresIn,
        refreshExpiresIn,
        { issuer: 'auth-service-test' },
      );
      const session = service.signTokenPair(userId, Roles.USER);
      const decoded = service.verifyToken(
        session.refreshToken,
      ) as TokenClaims & {
        iat: number;
      };

      assert.strictEqual(decoded.exp - decoded.iat, refreshExpiresIn);
    });

    test('should apply a per-call access TTL without changing the instance TTL', () => {
      const instanceTtl = 3600;
      const service = new JwtService(keyring, instanceTtl, 86400, {
        issuer: 'auth-service-test',
      });

      const overridden = service.signTokenPair(userId, Roles.USER, undefined, {
        accessExpiresIn: 600,
      });
      const claims = service.verifyToken(
        overridden.accessToken,
      ) as TokenClaims & {
        iat: number;
      };
      assert.strictEqual(claims.exp - claims.iat, 600);

      const fallback = service.signTokenPair(userId, Roles.USER);
      const fallbackClaims = service.verifyToken(
        fallback.accessToken,
      ) as TokenClaims & { iat: number };
      assert.strictEqual(fallbackClaims.exp - fallbackClaims.iat, instanceTtl);
    });

    test('should apply a per-call refresh TTL to the token and refreshExpiresAt', () => {
      const service = new JwtService(keyring, 3600, 86400, {
        issuer: 'auth-service-test',
      });
      const before = Date.now();
      const session = service.signTokenPair(userId, Roles.USER, undefined, {
        refreshExpiresIn: 7200,
      });
      const claims = service.verifyToken(
        session.refreshToken,
      ) as TokenClaims & {
        iat: number;
      };

      assert.strictEqual(claims.exp - claims.iat, 7200);
      const offset = session.refreshExpiresAt.getTime() - before;
      assert.ok(offset >= 7199 * 1000 && offset <= 7201 * 1000);
    });

    test('should fall back to both instance TTLs when no override is given', () => {
      const accessTtl = 1800;
      const refreshTtl = 7200;
      const service = new JwtService(keyring, accessTtl, refreshTtl, {
        issuer: 'auth-service-test',
      });

      const session = service.signTokenPair(userId, Roles.USER);
      const access = service.verifyToken(session.accessToken) as TokenClaims & {
        iat: number;
      };
      const refresh = service.verifyToken(
        session.refreshToken,
      ) as TokenClaims & { iat: number };

      assert.strictEqual(access.exp - access.iat, accessTtl);
      assert.strictEqual(refresh.exp - refresh.iat, refreshTtl);
    });
  });

  describe('RS256 signing', () => {
    test('should sign access tokens with RS256, a published kid and standard claims', () => {
      const session = jwtService.signTokenPair(userId, Roles.USER);
      const header = jwt.decode(session.accessToken, {
        complete: true,
      })?.header;

      assert.strictEqual(header?.alg, 'RS256');
      if (!header?.kid) {
        throw new Error('Missing kid');
      }
      assert.ok(keyring.getPublicKey(header.kid));

      const claims = jwtService.verifyToken(session.accessToken);
      assert.strictEqual(claims.sub, userId);
      assert.strictEqual(claims.userId, userId);
      assert.strictEqual(claims.role, Roles.USER);
      assert.strictEqual(claims.type, TokenTypes.ACCESS);
      assert.strictEqual(claims.iss, 'auth-service-test');
      assert.ok(claims.jti);
      assert.ok(claims.exp > 0);
    });

    test('should include the application audience and grant role on app tokens', () => {
      const token = jwtService.signAccessToken(
        userId,
        GrantRoles.ADMIN,
        'app-a',
      );

      const claims = jwtService.verifyToken(token, { audience: 'app-a' });
      assert.strictEqual(claims.aud, 'app-a');
      assert.strictEqual(claims.role, GrantRoles.ADMIN);
      assert.strictEqual(claims.type, TokenTypes.ACCESS);
    });

    test('should apply a per-call access TTL to application tokens', () => {
      const token = jwtService.signAccessToken(
        userId,
        GrantRoles.VIEWER,
        'app-a',
        { accessExpiresIn: 600 },
      );

      const claims = jwtService.verifyToken(token, {
        audience: 'app-a',
      }) as TokenClaims & { iat: number };
      assert.strictEqual(claims.exp - claims.iat, 600);
    });

    test('should reject a token issued for another audience', () => {
      const token = jwtService.signAccessToken(
        userId,
        GrantRoles.VIEWER,
        'app-a',
      );

      assert.throws(
        () => jwtService.verifyToken(token, { audience: 'app-b' }),
        (error: unknown) => (error as Error).name === 'InvalidTokenError',
      );
    });

    test('should reject a tampered signature', () => {
      const token = jwtService.signAccessToken(
        userId,
        GrantRoles.VIEWER,
        'app-a',
      );
      const [header, payload] = token.split('.');
      const tampered = `${header}.${payload}.${'a'.repeat(342)}`;

      assert.throws(
        () => jwtService.verifyToken(tampered, { audience: 'app-a' }),
        (error: unknown) => (error as Error).name === 'InvalidTokenError',
      );
    });

    test('should reject a token signed by an unknown key', () => {
      const otherKeyring = new JwtKeyring([
        { ...createRsaKeyPair(), active: true },
      ]);
      const otherService = new JwtService(
        otherKeyring,
        jwtExpiresIn,
        jwtRefreshExpiresIn,
        { issuer: 'auth-service-test' },
      );
      const token = otherService.signAccessToken(
        userId,
        GrantRoles.VIEWER,
        'app-a',
      );

      assert.throws(
        () => jwtService.verifyToken(token, { audience: 'app-a' }),
        (error: unknown) => (error as Error).name === 'InvalidTokenError',
      );
    });

    test('should reject a refresh token when verifying for an audience', () => {
      const session = jwtService.signTokenPair(userId, Roles.USER);

      assert.throws(
        () =>
          jwtService.verifyToken(session.refreshToken, { audience: 'app-a' }),
        (error: unknown) => (error as Error).name === 'InvalidTokenError',
      );
    });

    test('should log the underlying verification error', () => {
      const logger = {
        info: mock.fn(),
        warn: mock.fn(),
        error: mock.fn(),
        debug: mock.fn(),
      };
      const service = new JwtService(
        keyring,
        jwtExpiresIn,
        jwtRefreshExpiresIn,
        { issuer: 'auth-service-test', logger },
      );

      assert.throws(
        () => service.verifyToken('invalid.token.here'),
        (error: unknown) => (error as Error).name === 'InvalidTokenError',
      );
      assert.strictEqual(logger.debug.mock.callCount(), 1);
    });

    test('should reject an invalid token', () => {
      assert.throws(
        () => jwtService.verifyToken('invalid.token.here'),
        (error: unknown) =>
          (error as Error).name === 'InvalidTokenError' &&
          (error as Error).message ===
            'InvalidTokenError: Token is invalid or has expired',
      );
    });
  });

  describe('legacy HS256 migration', () => {
    const signLegacy = (payload: Record<string, unknown>) =>
      jwt.sign(
        {
          userId,
          role: Roles.USER,
          type: TokenTypes.ACCESS,
          jti: '550e8400-e29b-41d4-a716-446655440000',
          ...payload,
        },
        jwtSecret,
        { expiresIn: '1h' },
      );

    test('should verify a legacy token without an expected audience', () => {
      const claims = jwtService.verifyToken(signLegacy({}));

      assert.strictEqual(claims.userId, userId);
      assert.strictEqual(claims.type, TokenTypes.ACCESS);
    });

    test('should reject a legacy token when an audience is expected', () => {
      assert.throws(
        () => jwtService.verifyToken(signLegacy({}), { audience: 'app-a' }),
        (error: unknown) => (error as Error).name === 'InvalidTokenError',
      );
    });

    test('should reject a legacy token that carries an audience', () => {
      assert.throws(
        () => jwtService.verifyToken(signLegacy({ aud: 'app-a' })),
        (error: unknown) => (error as Error).name === 'InvalidTokenError',
      );
    });

    test('should reject legacy tokens when no legacy secret is configured', () => {
      const service = new JwtService(
        keyring,
        jwtExpiresIn,
        jwtRefreshExpiresIn,
        {
          issuer: 'auth-service-test',
        },
      );

      assert.throws(
        () => service.verifyToken(signLegacy({})),
        (error: unknown) => (error as Error).name === 'InvalidTokenError',
      );
    });
  });

  describe('MFA challenge', () => {
    test('should not verify as an access token for the application audience', () => {
      const challenge = jwtService.signMfaChallenge(userId, {
        application: 'app-slug',
        audience: 'app-aud',
      });

      const claims = jwtService.verifyMfaChallenge(challenge);

      assert.strictEqual(claims.type, TokenTypes.MFA);
      assert.strictEqual(claims.aud, 'auth-service:mfa');
      assert.strictEqual(claims.targetAudience, 'app-aud');
      assert.strictEqual(claims.role, undefined);

      assert.throws(
        () => jwtService.verifyToken(challenge, { audience: 'app-aud' }),
        (error: unknown) => (error as Error).name === 'InvalidTokenError',
      );
    });
  });

  describe('tenant token removal', () => {
    test('should not expose tenant token generation', () => {
      assert.strictEqual(
        (jwtService as unknown as Record<string, unknown>)[
          'generateTenantToken'
        ],
        undefined,
      );
    });
  });
});
