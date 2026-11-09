import type { Application } from 'express';

import type { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import type { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import type { LoggerInterface } from '../libs/logger';
import { HoldersController } from './holders.controller';
import type { HoldersPort } from './holders.port';
import { HoldersRouter } from './holders.router';

export class HoldersModule {
  private readonly controller: HoldersController;

  constructor(
    holdersService: HoldersPort,
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly authorizationMiddleware: AuthorizationMiddleware,
    private readonly logger: LoggerInterface,
  ) {
    this.controller = new HoldersController(holdersService);
  }

  initialize(app: Application): void {
    new HoldersRouter(
      this.authenticationMiddleware,
      this.authorizationMiddleware,
      this.controller,
      app,
    );
    this.logger.info('Init Module - Holders - OK');
  }
}
