import type { Application } from 'express';

import { Roles } from '../common/enums/roles.enum';
import type { ApplicationAuthorizationMiddleware } from '../common/middlewares/application-authorization.middleware';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import { createRateLimiter } from '../common/middlewares/rate-limiter.middleware';
import type { LinksController } from './links.controller';

/** Resends are cheap but must not be spammed: three per minute per invitation. */
export const INVITATION_RESEND_RATE_LIMIT_WINDOW_MS = 60_000;
export const INVITATION_RESEND_RATE_LIMIT_MAX = 3;

/** Resend carries no body; the global body guard must skip it. */
export const LINKS_BODYLESS_PATHS: readonly RegExp[] = [
  /^\/applications\/[^/]+\/invitations\/[^/]+\/resend\/?$/i,
];

export class LinksRouter {
  constructor(
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly applicationAuthorizationMiddleware: ApplicationAuthorizationMiddleware,
    private readonly authorizationMiddleware: AuthorizationMiddleware,
    private readonly linksController: LinksController,
    private readonly app: Application,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    const resendRateLimiter = createRateLimiter(
      INVITATION_RESEND_RATE_LIMIT_WINDOW_MS,
      INVITATION_RESEND_RATE_LIMIT_MAX,
      undefined,
      undefined,
      (req) => `${req.params.applicationId}:${req.params.invitationId}`,
    );

    this.app.post(
      '/applications/:applicationId/invitations/:invitationId/resend',
      this.authenticationMiddleware.authenticateAny,
      this.applicationAuthorizationMiddleware.allowApplicationAdmin,
      resendRateLimiter,
      this.linksController.resendInvitation.bind(this.linksController),
    );

    this.app.delete(
      '/applications/:applicationId/invitations/:invitationId',
      this.authenticationMiddleware.authenticateAny,
      this.applicationAuthorizationMiddleware.allowApplicationAdmin,
      this.linksController.revokeInvitation.bind(this.linksController),
    );

    this.app.post(
      '/applications/:applicationId/invitations',
      this.authenticationMiddleware.authenticateAny,
      this.applicationAuthorizationMiddleware.allowApplicationAdmin,
      this.linksController.createInvitation.bind(this.linksController),
    );

    this.app.post(
      '/auth/invitations/accept',
      this.linksController.acceptInvitation.bind(this.linksController),
    );

    this.app.post(
      '/auth/password-reset-links',
      this.authenticationMiddleware.authenticate,
      this.authorizationMiddleware.allowRoles(Roles.OWNER),
      this.linksController.createPasswordResetLink.bind(this.linksController),
    );

    this.app.post(
      '/auth/password-reset-links/accept',
      this.linksController.acceptPasswordResetLink.bind(this.linksController),
    );
  }
}
