import type { Application } from 'express';

import type { HealthController } from './health.controller';

export class HealthRouter {
  constructor(
    private readonly healthController: HealthController,
    private readonly app: Application,
  ) {
    this.app.get('/health', this.healthController.check);
    this.app.get('/ready', this.healthController.ready);
  }
}
