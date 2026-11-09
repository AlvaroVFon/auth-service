import type { Application } from 'express';

import { Roles } from '../common/enums/roles.enum';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import { createRateLimiter } from '../common/middlewares/rate-limiter.middleware';
import type { SettingsController } from './settings.controller';

/** Settings writes are rare and owner-only; the window is intentionally wide. */
export const SETTINGS_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const SETTINGS_RATE_LIMIT_MAX = 30;

export class SettingsRouter {
  constructor(
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly authorizationMiddleware: AuthorizationMiddleware,
    private readonly controller: SettingsController,
    private readonly app: Application,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    const ownerOnly = [
      this.authenticationMiddleware.authenticateAny,
      this.authorizationMiddleware.allowRoles(Roles.OWNER),
    ];
    const writeRateLimiter = createRateLimiter(
      SETTINGS_RATE_LIMIT_WINDOW_MS,
      SETTINGS_RATE_LIMIT_MAX,
    );

    this.app.get(
      '/settings',
      ...ownerOnly,
      this.controller.getSettings.bind(this.controller),
    );

    this.app.patch(
      '/settings',
      ...ownerOnly,
      writeRateLimiter,
      this.controller.updateSettings.bind(this.controller),
    );
  }
}
