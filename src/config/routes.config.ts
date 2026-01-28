import type { Application } from 'express';
import { healthCheckRouter } from '../health/routes';

const setupRoutes = (app: Application) => {
  app.use('/v1', healthCheckRouter);
};

export { setupRoutes };
