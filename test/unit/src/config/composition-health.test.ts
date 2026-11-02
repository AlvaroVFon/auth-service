import express, { Application } from 'express';
import request from 'supertest';

import { createApplicationComposition } from '../../../../src/config/application.composition';
import { silentLogger } from '../../../mocks/logger.mock';

describe('Application composition', () => {
  test('reports readiness from the injected database', async () => {
    const database = {
      connect: async () => {},
      close: async () => {},
      getReadyState: () => 1,
    };
    const composition = createApplicationComposition({
      database: database as never,
      logger: silentLogger,
      trustProxy: 1,
    });
    const app: Application = express();

    composition.initialize(app);

    const response = await request(app).get('/ready').expect(200);

    assert.deepStrictEqual(response.body, { status: 'ready' });
  });
});
