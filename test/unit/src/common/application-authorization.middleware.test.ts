import { Request, Response } from 'express';

import { Roles } from '../../../../src/common/enums/roles.enum';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../../../src/common/exceptions/auth.exceptions';
import { ApplicationAuthorizationMiddleware } from '../../../../src/common/middlewares/application-authorization.middleware';
import { GrantRoles } from '../../../../src/grants/grants.interface';

const buildRequest = (role: Roles): Partial<Request> => ({
  user: { id: '507f191e810c19729de860ea', role },
  params: { applicationId: '64b64c4f4f4f4f4f4f4f4f4f' },
});

describe('ApplicationAuthorizationMiddleware', () => {
  let findByUserAndApplication: ReturnType<typeof mock.fn>;
  let middleware: ApplicationAuthorizationMiddleware;
  let next: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    findByUserAndApplication = mock.fn();
    middleware = new ApplicationAuthorizationMiddleware({
      findByUserAndApplication,
    } as never);
    next = mock.fn();
  });

  test('should let the owner through without a grant lookup', async () => {
    await middleware.allowApplicationAdmin(
      buildRequest(Roles.OWNER) as Request,
      {} as Response,
      next,
    );

    assert.strictEqual(next.mock.calls[0]?.arguments[0], undefined);
    assert.strictEqual(findByUserAndApplication.mock.callCount(), 0);
  });

  test('should let the admin of the application through', async () => {
    findByUserAndApplication.mock.mockImplementation(async () => ({
      role: GrantRoles.ADMIN,
    }));

    await middleware.allowApplicationAdmin(
      buildRequest(Roles.USER) as Request,
      {} as Response,
      next,
    );

    assert.strictEqual(next.mock.calls[0]?.arguments[0], undefined);
  });

  test('should reject viewer and editor grants', async () => {
    for (const role of [GrantRoles.VIEWER, GrantRoles.EDITOR]) {
      findByUserAndApplication.mock.mockImplementation(async () => ({ role }));
      next = mock.fn();

      await middleware.allowApplicationAdmin(
        buildRequest(Roles.USER) as Request,
        {} as Response,
        next,
      );

      assert.ok(next.mock.calls[0]?.arguments[0] instanceof ForbiddenError);
    }
  });

  test('should reject a user without a grant', async () => {
    findByUserAndApplication.mock.mockImplementation(async () => null);

    await middleware.allowApplicationAdmin(
      buildRequest(Roles.USER) as Request,
      {} as Response,
      next,
    );

    assert.ok(next.mock.calls[0]?.arguments[0] instanceof ForbiddenError);
  });

  test('should reject an unauthenticated request', async () => {
    await middleware.allowApplicationAdmin(
      { params: {} } as Request,
      {} as Response,
      next,
    );

    assert.ok(next.mock.calls[0]?.arguments[0] instanceof UnauthorizedError);
  });

  test('should reject a request without an application id', async () => {
    await middleware.allowApplicationAdmin(
      { user: { id: '1', role: Roles.USER }, params: {} } as Request,
      {} as Response,
      next,
    );

    assert.ok(next.mock.calls[0]?.arguments[0] instanceof ForbiddenError);
  });
});
