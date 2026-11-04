import type { Application } from 'express';

import { Roles } from '../common/enums/roles.enum';
import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import type { JwksController } from './jwks.controller';

export class JwksRouter {
  constructor(
    private readonly jwksController: JwksController,
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly authorizationMiddleware: AuthorizationMiddleware,
    private readonly app: Application,
  ) {
    this.app.get('/.well-known/jwks.json', this.jwksController.show);
    this.app.get(
      '/jwks/status',
      this.authenticationMiddleware.authenticate,
      this.authorizationMiddleware.allowRoles(Roles.OWNER),
      this.jwksController.status,
    );
  }
}
