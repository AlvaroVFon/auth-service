import { Types } from 'mongoose';

import { Application } from '../../../../../src/applications/applications.interface';
import { ApplicationsPort } from '../../../../../src/applications/applications.port';
import {
  UserProfile,
  ProfileService,
} from '../../../../../src/auth/services/profile.service';
import { Roles } from '../../../../../src/common/enums/roles.enum';
import { EntityNotFoundError } from '../../../../../src/common/exceptions/base.exception';
import { TokenBlacklistPort } from '../../../../../src/common/ports/token-blacklist.port';
import { GrantRoles } from '../../../../../src/grants/grants.interface';
import { GrantsPort } from '../../../../../src/grants/grants.port';
import { JwtService } from '../../../../../src/libs/jwt/jwt.service';
import { TokenTypes } from '../../../../../src/libs/jwt/token-types.enum';
import { UsersPort } from '../../../../../src/users/users.port';

const USER_ID = '507f191e810c19729de860ea';
const OTHER_USER_ID = '507f191e810c19729de860eb';
const APPLICATION_ID = '507f191e810c19729de860e1';
const OTHER_APPLICATION_ID = '507f191e810c19729de860e2';
const EXPIRES_AT = new Date('2030-01-01T00:00:00.000Z');

const buildApplication = (
  id: string,
  overrides: Partial<Application> = {},
): Application => ({
  _id: new Types.ObjectId(id),
  name: `Application ${id.slice(-2)}`,
  slug: `app-${id.slice(-2)}`,
  audience: `aud-${id.slice(-2)}`,
  active: true,
  ...overrides,
});

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
  let listActiveByUser: ReturnType<typeof mock.fn>;
  let findAllForContext: ReturnType<typeof mock.fn>;
  let service: ProfileService;

  beforeEach(() => {
    findById = mock.fn(async () => ({
      _id: USER_ID,
      email: 'user@example.com',
      role: Roles.USER,
      verified: true,
      mfaEnabled: false,
    }));
    verifyToken = mock.fn(() => claims());
    isBlacklisted = mock.fn(async () => false);
    listActiveByUser = mock.fn(async () => []);
    findAllForContext = mock.fn(async () => []);

    service = new ProfileService(
      { findById } as unknown as UsersPort,
      { verifyToken } as unknown as JwtService,
      { isBlacklisted } as unknown as TokenBlacklistPort,
      { listActiveByUser } as unknown as GrantsPort,
      { findAllForContext } as unknown as ApplicationsPort,
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

  describe('getContext', () => {
    const ownerIdentity = {
      id: USER_ID,
      role: Roles.OWNER,
      expiresAt: EXPIRES_AT,
    };

    test('should return the whole catalog with the owner role for the owner', async () => {
      const applicationA = buildApplication(APPLICATION_ID);
      const applicationB = buildApplication(OTHER_APPLICATION_ID);
      findById.mock.mockImplementation(async () => ({
        _id: USER_ID,
        email: 'user@example.com',
        role: Roles.OWNER,
        verified: true,
        mfaEnabled: false,
      }));
      findAllForContext.mock.mockImplementation(async () => [
        applicationA,
        applicationB,
      ]);

      const context = await service.getContext(ownerIdentity);

      assert.deepStrictEqual(context, {
        user: {
          id: USER_ID,
          email: 'user@example.com',
          verified: true,
          mfaEnabled: false,
        },
        role: Roles.OWNER,
        applications: [
          {
            id: APPLICATION_ID,
            name: applicationA.name,
            slug: applicationA.slug,
            audience: applicationA.audience,
            active: true,
            role: Roles.OWNER,
          },
          {
            id: OTHER_APPLICATION_ID,
            name: applicationB.name,
            slug: applicationB.slug,
            audience: applicationB.audience,
            active: true,
            role: Roles.OWNER,
          },
        ],
      });
      assert.strictEqual(listActiveByUser.mock.callCount(), 0);
    });

    test('should use the account role for an owner with an application-scoped token', async () => {
      const applicationA = buildApplication(APPLICATION_ID);
      const applicationB = buildApplication(OTHER_APPLICATION_ID);
      findById.mock.mockImplementation(async () => ({
        _id: USER_ID,
        email: 'user@example.com',
        role: Roles.OWNER,
        verified: true,
        mfaEnabled: false,
      }));
      findAllForContext.mock.mockImplementation(async () => [
        applicationA,
        applicationB,
      ]);

      const context = await service.getContext({
        id: USER_ID,
        role: GrantRoles.ADMIN,
        audience: applicationA.audience,
        expiresAt: EXPIRES_AT,
      });

      assert.strictEqual(context.role, Roles.OWNER);
      assert.deepStrictEqual(
        context.applications.map(({ role }) => role),
        [Roles.OWNER, Roles.OWNER],
      );
      assert.strictEqual(context.applications.length, 2);
      assert.strictEqual(listActiveByUser.mock.callCount(), 0);
    });

    test('should return only the granted applications for an app admin', async () => {
      const application = buildApplication(APPLICATION_ID);
      listActiveByUser.mock.mockImplementation(async () => [
        { application, role: GrantRoles.ADMIN },
      ]);

      const context = await service.getContext({
        id: USER_ID,
        role: GrantRoles.ADMIN,
        audience: application.audience,
        expiresAt: EXPIRES_AT,
      });

      assert.strictEqual(context.role, Roles.USER);
      assert.deepStrictEqual(context.applications, [
        {
          id: APPLICATION_ID,
          name: application.name,
          slug: application.slug,
          audience: application.audience,
          active: true,
          role: GrantRoles.ADMIN,
        },
      ]);
      assert.strictEqual(findAllForContext.mock.callCount(), 0);
    });

    test('should sort applications deterministically by name and slug', async () => {
      const zebra = buildApplication(APPLICATION_ID, { name: 'Zebra' });
      const alpha = buildApplication(OTHER_APPLICATION_ID, { name: 'Alpha' });
      listActiveByUser.mock.mockImplementation(async () => [
        { application: zebra, role: GrantRoles.VIEWER },
        { application: alpha, role: GrantRoles.EDITOR },
      ]);

      const context = await service.getContext({
        id: USER_ID,
        role: GrantRoles.VIEWER,
        audience: zebra.audience,
        expiresAt: EXPIRES_AT,
      });

      assert.deepStrictEqual(
        context.applications.map(({ name }) => name),
        ['Alpha', 'Zebra'],
      );
    });

    test('should return an empty list and the account role without grants', async () => {
      const context = await service.getContext({
        id: USER_ID,
        role: Roles.USER,
        expiresAt: EXPIRES_AT,
      });

      assert.deepStrictEqual(context.applications, []);
      assert.strictEqual(context.role, Roles.USER);
      assert.strictEqual(context.user.id, USER_ID);
    });

    test('should default mfaEnabled to false when it is unset', async () => {
      findById.mock.mockImplementation(async () => ({
        _id: USER_ID,
        email: 'user@example.com',
        verified: true,
      }));

      const context = await service.getContext(ownerIdentity);

      assert.strictEqual(context.user.mfaEnabled, false);
    });

    test('should reject a token whose user no longer exists', async () => {
      findById.mock.mockImplementation(async () => null);

      await assert.rejects(
        service.getContext(ownerIdentity),
        EntityNotFoundError,
      );
    });

    test('should never expose sensitive user fields', async () => {
      findById.mock.mockImplementation(async () => ({
        _id: USER_ID,
        email: 'user@example.com',
        password: 'hash',
        verified: true,
        mfaEnabled: true,
        mfaSecret: 'secret',
        mfaPendingSecret: 'pending',
        mfaRecoveryCodes: ['recovery'],
        loginAttempts: 3,
        mfaFailedAttempts: 2,
      }));

      const context = await service.getContext(ownerIdentity);

      assert.deepStrictEqual(context.user, {
        id: USER_ID,
        email: 'user@example.com',
        verified: true,
        mfaEnabled: true,
      });
      const serialized = JSON.stringify(context);
      assert.ok(!serialized.includes('secret'));
      assert.ok(!serialized.includes('recovery'));
      assert.ok(!serialized.includes('hash'));
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
