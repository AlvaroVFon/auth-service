import { Application } from 'express';

import { Roles } from '../common/enums/roles.enum';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import { createRateLimiter } from '../common/middlewares/rate-limiter.middleware';
import { UsersController } from './users.controller';

export interface UsersSupportRateLimitConfig {
  windowMs: number;
  max: number;
}

/**
 * Support actions take no input beyond the path parameter. Exported next to the
 * routes so the global body guard cannot drift from the route shapes.
 */
export const USER_SUPPORT_BODYLESS_PATHS: readonly RegExp[] = [
  /^\/users\/[^/]+\/(unlock|verify)\/?$/i,
  /^\/users\/[^/]+\/mfa\/reset\/?$/i,
];

export class UsersRouter {
  constructor(
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly authorizationMiddleware: AuthorizationMiddleware,
    private readonly userController: UsersController,
    private readonly supportRateLimit: UsersSupportRateLimitConfig,
    private readonly sessionRevokeRateLimit: UsersSupportRateLimitConfig,
    private readonly app: Application,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.app.use('/users', this.authenticationMiddleware.authenticate);
    this.app.use(
      '/users',
      this.authorizationMiddleware.allowRoles(Roles.OWNER),
    );

    this.app.post(
      '/users',
      this.userController.createUser.bind(this.userController),
    );

    this.app.get(
      '/users/:id',
      this.userController.getById.bind(this.userController),
    );

    this.app.get(
      '/users',
      this.userController.findAll.bind(this.userController),
    );

    this.app.get(
      '/users/:id/sessions',
      this.userController.listUserSessions.bind(this.userController),
    );

    this.app.patch(
      '/users/:id',
      this.userController.updateOneById.bind(this.userController),
    );

    this.app.delete(
      '/users/:id',
      this.userController.deleteUser.bind(this.userController),
    );

    // The support actions use the login window and budget numbers, but their
    // own limiter store: unlock, verify and mfa/reset share a budget with each
    // other, not with /auth/login.
    const supportRateLimiter = createRateLimiter(
      this.supportRateLimit.windowMs,
      this.supportRateLimit.max,
    );

    this.app.post(
      '/users/:id/unlock',
      supportRateLimiter,
      this.userController.unlock.bind(this.userController),
    );

    this.app.post(
      '/users/:id/verify',
      supportRateLimiter,
      this.userController.verify.bind(this.userController),
    );

    const sessionRateLimiter = createRateLimiter(
      this.sessionRevokeRateLimit.windowMs,
      this.sessionRevokeRateLimit.max,
    );

    this.app.delete(
      '/users/:id/sessions/:sessionId',
      sessionRateLimiter,
      this.userController.revokeUserSession.bind(this.userController),
    );

    this.app.delete(
      '/users/:id/sessions',
      sessionRateLimiter,
      this.userController.revokeAllUserSessions.bind(this.userController),
    );

    this.app.post(
      '/users/:id/mfa/reset',
      supportRateLimiter,
      this.userController.resetMfa.bind(this.userController),
    );
  }
}
