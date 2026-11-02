import type { Application } from 'express';

import type { JwksController } from './jwks.controller';

export class JwksRouter {
  constructor(
    private readonly jwksController: JwksController,
    private readonly app: Application,
  ) {
    this.app.get('/.well-known/jwks.json', this.jwksController.show);
  }
}
