import { NextFunction, Request, Response } from 'express';

import { Roles } from '../../../../src/common/enums/roles.enum';
import { ForbiddenError } from '../../../../src/common/exceptions/auth.exceptions';
import { AuthorizationMiddleware } from '../../../../src/common/middlewares/authorization.middleware';
import { GrantRoles } from '../../../../src/grants/grants.interface';

describe('AuthorizationMiddleware', () => {
  let middleware: AuthorizationMiddleware;
  let next: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    middleware = new AuthorizationMiddleware();
    next = mock.fn();
  });

  const run = (user: Request['user'], roles: Roles[]): void => {
    const handler = middleware.allowRoles(...roles);
    handler({ user } as Request, {} as Response, next as NextFunction);
  };

  test('should allow a matching global role', () => {
    run({ id: '1', role: Roles.ADMIN }, [Roles.ADMIN]);

    assert.strictEqual(next.mock.calls[0]?.arguments[0], undefined);
  });

  test('should reject a non-matching global role', () => {
    run({ id: '1', role: Roles.USER }, [Roles.ADMIN]);

    assert.ok(next.mock.calls[0]?.arguments[0] instanceof ForbiddenError);
  });

  test('should reject an unauthenticated request', () => {
    run(undefined, [Roles.ADMIN]);

    assert.ok(next.mock.calls[0]?.arguments[0] instanceof ForbiddenError);
  });

  test('should reject an application token even when its grant role matches', () => {
    run(
      {
        id: '1',
        role: GrantRoles.ADMIN,
        audience: 'app-a',
      },
      [Roles.ADMIN],
    );

    assert.ok(next.mock.calls[0]?.arguments[0] instanceof ForbiddenError);
  });
});
