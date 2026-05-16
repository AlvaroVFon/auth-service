import { ConfigEntryModel } from '../../../../../../src/libs/config-service/adapters/mongo-config-entry.schema';
import { MongoConfigService } from '../../../../../../src/libs/config-service/adapters/mongo-config.service';
import fixture from '../../../../../fixtures';
import { DEFAULT_CONFIG_ENTRIES } from '../../../../../fixtures/defaults/config.default';

describe('MongoConfigService', () => {
  let mongoConfigService: MongoConfigService;

  beforeEach(async () => {
    mongoConfigService = new MongoConfigService(ConfigEntryModel);
    await fixture.create('ConfigEntry', DEFAULT_CONFIG_ENTRIES[0]);
  });

  describe('get', () => {
    test('should retrieve a config value by key', async () => {
      const config = await mongoConfigService.get<{ service: string }>(
        'appName',
      );
      assert.strictEqual(config?.service, 'Authentication Service');
    });

    test('should return null for non-existing key', async () => {
      const config = await mongoConfigService.get('nonExistingKey');
      assert.strictEqual(config, null);
    });
  });
});
