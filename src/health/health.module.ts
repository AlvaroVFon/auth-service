import type { Application } from 'express';

import type { LoggerInterface } from '../libs/logger';
import { HealthController } from './health.controller';
import { HealthRouter } from './health.router';

export class HealthModule {
  private readonly controller: HealthController;

  constructor(private readonly logger: LoggerInterface) {
    this.controller = new HealthController();
  }

  initialize(app: Application): void {
    new HealthRouter(this.controller, app);
    this.logger.info('Init Module - Health - OK');
  }
}
