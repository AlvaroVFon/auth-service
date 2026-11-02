import {
  UserProfile,
  ProfileService,
} from '../../../../../src/auth/services/profile.service';
import { Roles } from '../../../../../src/common/enums/roles.enum';
import { EntityNotFoundError } from '../../../../../src/common/exceptions/base.exception';
import { TokenBlacklistPort } from '../../../../../src/common/ports/token-blacklist.port';
import { GrantRoles } from '../../../../../src/grants/grants.interface';
import { JwtService } from '../../../../../src/libs/jwt/jwt.service';
import { TokenTypes } from '../../../../../src/libs/jwt/token-types.enum';
import { UsersPort } from '../../../../../src/users/users.port';

const USER_ID = '507f191e810c19729de860ea';
const OTHER_USER_ID = '507f191e810c19729de860eb';
const EXPIRES_AT = new Date('2030-01-01T00:00:00.000Z');

const caller = {
  id: USER_ID,
  role: GrantRoles.EDITOR,
  audience: 'app-aud',
  expiresAt: EXPIRES_AT,
};

const claims = (overrides: Record<string, unknown> = {}) => ({
  userId: USER_ID,
  role: GrantRoles.EDITOR,
  type: TokenTypes.ACCESS,
  jti: '550e8400-e29b-41d4-a716-446655440000',
  aud: 'app-aud',
  exp: Math.floor(EXPIRES_AT.getTime() / 1000),
  ...overrides,
});

describe('ProfileService', () => {
  let findById: ReturnType<typeof mock.fn>;
  let verifyToken: ReturnType<typeof mock.fn>;
  let isBlacklisted: ReturnType<typeof mock.fn>;
  let service: ProfileService;

  beforeEach(() => {
    findById = mock.fn(async () => ({
      _id: USER_ID,
      email: 'user@example.com',
    }));
    verifyToken = mock.fn(() => claims());
    isBlacklisted = mock.fn(async () => false);

    service = new ProfileService(
      { findById } as unknown as UsersPort,
      { verifyToken } as unknown as JwtService,
      { isBlacklisted } as unknown as TokenBlacklistPort,
    );
  });

  describe('getProfile', () => {
    test('should return identity, application and expiration', async () => {
      const profile = await service.getProfile(caller);

      assert.deepStrictEqual(profile, {
        id: USER_ID,
        email: 'user@example.com',
        application: 'app-aud',
        role: GrantRoles.EDITOR,
        expiresAt: EXPIRES_AT,
      } satisfies UserProfile);
    });

    test('should return a null application for a global token', async () => {
      const profile = await service.getProfile({
        id: USER_ID,
        role: Roles.OWNER,
        expiresAt: EXPIRES_AT,
      });

      assert.strictEqual(profile.application, null);
      assert.strictEqual(profile.role, Roles.OWNER);
    });

    test('should reject a token whose user no longer exists', async () => {
      findById.mock.mockImplementation(async () => null);

      await assert.rejects(service.getProfile(caller), EntityNotFoundError);
    });
  });

  describe('introspect', () => {
    test('should report an active token from the caller and app', async () => {
      const result = await service.introspect('token', caller);

      assert.strictEqual(result.active, true);
      if (result.active) {
        assert.strictEqual(result.id, USER_ID);
        assert.strictEqual(result.application, 'app-aud');
        assert.strictEqual(result.role, GrantRoles.EDITOR);
        assert.strictEqual(result.expiresAt.getTime(), EXPIRES_AT.getTime());
      }
    });

    test('should report a global token as active', async () => {
      verifyToken.mock.mockImplementation(() =>
        claims({ aud: undefined, role: Roles.OWNER }),
      );

      const result = await service.introspect('token', {
        id: USER_ID,
        role: Roles.OWNER,
        expiresAt: EXPIRES_AT,
      });

      assert.strictEqual(result.active, true);
      if (result.active) {
        assert.strictEqual(result.application, null);
        assert.strictEqual(result.role, Roles.OWNER);
      }
    });

    test('should never introspect a token from another user', async () => {
      verifyToken.mock.mockImplementation(() =>
        claims({ userId: OTHER_USER_ID }),
      );

      const result = await service.introspect('token', caller);

      assert.deepStrictEqual(result, { active: false });
      assert.strictEqual(findById.mock.callCount(), 0);
    });

    test('should never introspect a token from another application', async () => {
      const result = await service.introspect('token', {
        ...caller,
        audience: 'other-aud',
      });

      assert.deepStrictEqual(result, { active: false });
    });

    test('should report a revoked token as inactive', async () => {
      isBlacklisted.mock.mockImplementation(async () => true);

      const result = await service.introspect('token', caller);

      assert.deepStrictEqual(result, { active: false });
    });

    test('should report an invalid or expired token as inactive', async () => {
      verifyToken.mock.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const result = await service.introspect('token', caller);

      assert.deepStrictEqual(result, { active: false });
    });

    test('should report a refresh token as inactive', async () => {
      verifyToken.mock.mockImplementation(() =>
        claims({ type: TokenTypes.REFRESH }),
      );

      const result = await service.introspect('token', caller);

      assert.deepStrictEqual(result, { active: false });
    });

    test('should report a deleted user as inactive', async () => {
      findById.mock.mockImplementation(async () => null);

      const result = await service.introspect('token', caller);

      assert.deepStrictEqual(result, { active: false });
    });

    test('should propagate blacklist failures instead of reporting inactive', async () => {
      isBlacklisted.mock.mockImplementation(async () => {
        throw new Error('blacklist unavailable');
      });

      await assert.rejects(
        service.introspect('token', caller),
        /blacklist unavailable/,
      );
    });

    test('should propagate user lookup failures instead of reporting inactive', async () => {
      findById.mock.mockImplementation(async () => {
        throw new Error('database unavailable');
      });

      await assert.rejects(
        service.introspect('token', caller),
        /database unavailable/,
      );
    });
  });
});
