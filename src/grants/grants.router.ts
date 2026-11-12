import type { Application } from 'express';

import type { RateLimitPolicyResolver } from '../auth/auth.router';
import type { ApplicationAuthorizationMiddleware } from '../common/middlewares/application-authorization.middleware';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { createDynamicRateLimiter } from '../common/middlewares/rate-limiter.middleware';
import type { GrantsController } from './grants.controller';

export interface GrantsRateLimitConfig {
  membersWrite: {
    windowMs: number;
    max: number;
  };
}

export class GrantsRouter {
  constructor(
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly applicationAuthorizationMiddleware: ApplicationAuthorizationMiddleware,
    private readonly grantsController: GrantsController,
    private readonly rateLimitConfig: GrantsRateLimitConfig,
    private readonly rateLimitPolicy: RateLimitPolicyResolver,
    private readonly app: Application,
  ) {
    // Kept for callers that still pass `grantsRateLimit`; the settings layer is
    // now authoritative and resolves the policy per request.
    void this.rateLimitConfig;
    this.initializeRoutes();
  }

  private initializeRoutes() {
    const appAdminOnly = [
      this.authenticationMiddleware.authenticateAny,
      this.applicationAuthorizationMiddleware.allowApplicationAdmin,
    ];
    const membersWriteRateLimiter = createDynamicRateLimiter({
      resolveApplicationId: async (request) => {
        const applicationId = request.params.applicationId;
        return typeof applicationId === 'string' ? applicationId : undefined;
      },
      resolvePolicy: (applicationId) =>
        this.rateLimitPolicy.resolveRateLimitPolicy(
          applicationId,
          'management',
        ),
    });

    this.app.post(
      '/applications/:applicationId/members',
      ...appAdminOnly,
      membersWriteRateLimiter,
      this.grantsController.createMember.bind(this.grantsController),
    );

    this.app.put(
      '/applications/:applicationId/grants',
      ...appAdminOnly,
      this.grantsController.upsert.bind(this.grantsController),
    );

    this.app.get(
      '/applications/:applicationId/members',
      ...appAdminOnly,
      this.grantsController.listMembers.bind(this.grantsController),
    );

    this.app.get(
      '/applications/:applicationId/grants',
      ...appAdminOnly,
      this.grantsController.list.bind(this.grantsController),
    );

    this.app.get(
      '/applications/:applicationId/grants/:userId',
      ...appAdminOnly,
      this.grantsController.getOne.bind(this.grantsController),
    );

    this.app.delete(
      '/applications/:applicationId/grants/:userId',
      ...appAdminOnly,
      this.grantsController.revoke.bind(this.grantsController),
    );
  }
}
