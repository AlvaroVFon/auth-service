import type { Application } from 'express';

import { Roles } from '../common/enums/roles.enum';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import { createRateLimiter } from '../common/middlewares/rate-limiter.middleware';
import type { AuditController } from './audit.controller';

/** Exports are expensive and rare: five per minute per IP. */
export const AUDIT_EXPORT_RATE_LIMIT_WINDOW_MS = 60_000;
export const AUDIT_EXPORT_RATE_LIMIT_MAX = 5;

export class AuditRouter {
  constructor(
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly authorizationMiddleware: AuthorizationMiddleware,
    private readonly auditController: AuditController,
    private readonly app: Application,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    const ownerOnly = [
      this.authenticationMiddleware.authenticate,
      this.authorizationMiddleware.allowRoles(Roles.OWNER),
    ];
    const exportRateLimiter = createRateLimiter(
      AUDIT_EXPORT_RATE_LIMIT_WINDOW_MS,
      AUDIT_EXPORT_RATE_LIMIT_MAX,
    );

    this.app.get(
      '/audit-events',
      ...ownerOnly,
      this.auditController.list.bind(this.auditController),
    );

    this.app.get(
      '/audit-events/events',
      ...ownerOnly,
      this.auditController.catalog.bind(this.auditController),
    );

    this.app.get(
      '/audit-events/export',
      ...ownerOnly,
      exportRateLimiter,
      this.auditController.exportCsv.bind(this.auditController),
    );
  }
}
