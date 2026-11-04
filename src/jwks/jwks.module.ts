import type { Application } from 'express';

import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import type { JwkPublicKey, JwtKeyringStatus } from '../libs/jwt';
import type { LoggerInterface } from '../libs/logger';
import { JwksController } from './jwks.controller';
import { JwksRouter } from './jwks.router';

export interface JwksModuleDependencies {
  logger: LoggerInterface;
  getJwks: () => JwkPublicKey[];
  getKeyStatus: () => JwtKeyringStatus;
  authenticationMiddleware: AuthenticationMiddleware;
  authorizationMiddleware: AuthorizationMiddleware;
}

export class JwksModule {
  private readonly logger: LoggerInterface;
  private readonly authenticationMiddleware: AuthenticationMiddleware;
  private readonly authorizationMiddleware: AuthorizationMiddleware;
  private readonly controller: JwksController;

  constructor(dependencies: JwksModuleDependencies) {
    this.logger = dependencies.logger;
    this.authenticationMiddleware = dependencies.authenticationMiddleware;
    this.authorizationMiddleware = dependencies.authorizationMiddleware;
    this.controller = new JwksController(
      dependencies.getJwks,
      dependencies.getKeyStatus,
    );
  }

  initialize(app: Application): void {
    new JwksRouter(
      this.controller,
      this.authenticationMiddleware,
      this.authorizationMiddleware,
      app,
    );
    this.logger.info('Init Module - Jwks - OK');
  }
}
