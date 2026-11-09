import express from 'express';

import { bootstrap } from '../../../../src/config/bootstrap';
import { GlobalSettingsModel } from '../../../../src/settings';
import { silentLogger } from '../../../mocks/logger.mock';

describe('bootstrap settings seed', () => {
  test('seeds the global settings through the default path', async () => {
    const originalAppName = process.env.APP_NAME;
    process.env.APP_NAME = 'Boot seeded';

    try {
      await bootstrap({
        logger: silentLogger,
        app: express(),
        database: { connect: async () => {} },
        startServer: (() => ({ close: () => {} })) as never,
        ownerCredentials: null,
      });
    } finally {
      if (originalAppName === undefined) {
        delete process.env.APP_NAME;
      } else {
        process.env.APP_NAME = originalAppName;
      }
    }

    const document = await GlobalSettingsModel.findById('global');
    assert.strictEqual(document?.appName, 'Boot seeded');
  });
});
