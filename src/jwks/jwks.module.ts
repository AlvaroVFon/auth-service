import type { Application } from 'express';

import type { JwkPublicKey } from '../libs/jwt';
import type { LoggerInterface } from '../libs/logger';
import { JwksController } from './jwks.controller';
import { JwksRouter } from './jwks.router';

export class JwksModule {
  private readonly controller: JwksController;

  constructor(
    private readonly logger: LoggerInterface,
    getJwks: () => JwkPublicKey[],
  ) {
    this.controller = new JwksController(getJwks);
  }

  initialize(app: Application): void {
    new JwksRouter(this.controller, app);
    this.logger.info('Init Module - Jwks - OK');
  }
}
