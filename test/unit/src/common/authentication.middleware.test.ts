import { Request, Response } from 'express';
import { AuthenticationMiddleware } from '../../../../src/common/middlewares/authentication.middleware';
import { InvalidCredentialsError } from '../../../../src/common/exceptions/auth.exceptions';
import { TokenTypes } from '../../../../src/libs/jwt/token-types.enum';
import { Roles } from '../../../../src/common/enums/roles.enum';

describe('AuthenticationMiddleware', () => {
  let verifyTokenFn: (token: string) => unknown;
  let isBlacklistedFn: (jti: string) => Promise<boolean>;
  let middleware: AuthenticationMiddleware;
  let req: Partial<Request>;
  let next: ReturnType<typeof mock.fn>;

  before(() => {
    verifyTokenFn = () => null;
    isBlacklistedFn = async () => false;

    const jwtService = {
      verifyToken: (token: string) => verifyTokenFn(token),
    };

    const blacklistService = {
      isBlacklisted: (jti: string) => isBlacklistedFn(jti),
      blacklist: async () => {},
    };

    middleware = new AuthenticationMiddleware(
      jwtService as never,
      blacklistService as never,
    );

    req = {} as Partial<Request>;
    next = mock.fn();
  });

  beforeEach(() => {
    req.headers = {};
    next = mock.fn();
  });

  function buildPayload(overrides: Record<string, unknown> = {}) {
    return {
      userId: '507f191e810c19729de860ea',
      role: Roles.USER,
      type: TokenTypes.ACCESS,
      jti: '550e8400-e29b-41d4-a716-446655440000',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      ...overrides,
    };
  }

  test('should reject a refresh token used as Bearer', async () => {
    verifyTokenFn = () => buildPayload({ type: TokenTypes.REFRESH });
    req.headers = { authorization: 'Bearer some-token' };

    await middleware.authenticate(req as Request, {} as Response, next);

    assert.strictEqual(next.mock.calls.length, 1);
    const error = next.mock.calls[0]?.arguments[0] as Error;
    assert.ok(error instanceof InvalidCredentialsError);
  });

  test('should reject an access token missing jti', async () => {
    verifyTokenFn = () => buildPayload({ jti: undefined });
    req.headers = { authorization: 'Bearer some-token' };

    await middleware.authenticate(req as Request, {} as Response, next);

    assert.strictEqual(next.mock.calls.length, 1);
    const error = next.mock.calls[0]?.arguments[0] as Error;
    assert.ok(error instanceof InvalidCredentialsError);
  });

  test('should reject a blacklisted jti', async () => {
    verifyTokenFn = () => buildPayload();
    isBlacklistedFn = async () => true;
    req.headers = { authorization: 'Bearer some-token' };

    await middleware.authenticate(req as Request, {} as Response, next);

    assert.strictEqual(next.mock.calls.length, 1);
    const error = next.mock.calls[0]?.arguments[0] as Error;
    assert.ok(error instanceof InvalidCredentialsError);
  });

  test('should call next() for a valid access token', async () => {
    verifyTokenFn = () => buildPayload();
    isBlacklistedFn = async () => false;
    req.headers = { authorization: 'Bearer some-token' };

    await middleware.authenticate(req as Request, {} as Response, next);

    assert.strictEqual(next.mock.calls.length, 1);
    assert.strictEqual(next.mock.calls[0]?.arguments[0], undefined);
  });

  test('should populate req.user with jti and expiresAt', async () => {
    const payload = buildPayload();
    verifyTokenFn = () => payload;
    isBlacklistedFn = async () => false;
    req.headers = { authorization: 'Bearer some-token' };

    await middleware.authenticate(req as Request, {} as Response, next);

    assert.ok(req.user);
    assert.strictEqual(req.user?.jti, payload.jti);
    assert.ok(req.user?.expiresAt instanceof Date);
    if (payload.exp) {
      assert.strictEqual(req.user?.expiresAt?.getTime(), payload.exp * 1000);
    }
  });
});
