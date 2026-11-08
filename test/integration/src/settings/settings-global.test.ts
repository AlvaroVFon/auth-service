import { Application } from '../../../../src/applications/applications.interface';
import { ApplicationModel } from '../../../../src/applications/applications.schema';
import { ApplicationsService } from '../../../../src/applications/applications.service';
import { GlobalSettingsRepository } from '../../../../src/settings/settings-global.repository';
import { GlobalSettingsModel } from '../../../../src/settings/settings-global.schema';
import { ensureGlobalSettings } from '../../../../src/settings/settings.seed';
import { SettingsService } from '../../../../src/settings/settings.service';
import fixture from '../../../fixtures';
import { ApplicationFactory } from '../../../helpers/factories/application.factory';

describe('Global settings persistence', () => {
  const documentCount = () => GlobalSettingsModel.countDocuments();

  test('the first seed creates a single document with the environment policy', async () => {
    await ensureGlobalSettings(GlobalSettingsModel, {
      appName: 'Seeded',
      accessTokenTtlSeconds: 120,
      maxSessionsPerUser: 8,
    });

    assert.strictEqual(await documentCount(), 1);
    const document = await GlobalSettingsModel.findById('global');
    assert.strictEqual(document?.appName, 'Seeded');
    assert.strictEqual(document?.accessTokenTtlSeconds, 120);
    assert.strictEqual(document?.maxSessionsPerUser, 8);
  });

  test('a second seed neither duplicates nor overwrites edited values', async () => {
    await ensureGlobalSettings(GlobalSettingsModel, { appName: 'Seeded' });
    await GlobalSettingsModel.updateOne(
      { _id: 'global' },
      { $set: { appName: 'Edited' } },
    );

    const edited = await GlobalSettingsModel.findById('global');
    const updatedAt = edited?.updatedAt;

    await ensureGlobalSettings(GlobalSettingsModel, { appName: 'Seeded' });

    assert.strictEqual(await documentCount(), 1);
    const document = await GlobalSettingsModel.findById('global');
    assert.strictEqual(document?.appName, 'Edited');
    assert.strictEqual(document?.updatedAt?.getTime(), updatedAt?.getTime());
  });

  test('the document only contains policy fields', async () => {
    process.env.JWT_PRIVATE_KEY = 'secret-private-key';
    process.env.SMTP_PASS = 'secret-smtp';
    process.env.TELEGRAM_BOT_TOKEN = 'secret-telegram';

    try {
      await ensureGlobalSettings(GlobalSettingsModel, {
        appName: 'Policy only',
      });
    } finally {
      delete process.env.JWT_PRIVATE_KEY;
      delete process.env.SMTP_PASS;
      delete process.env.TELEGRAM_BOT_TOKEN;
    }

    const document = await GlobalSettingsModel.findById('global').lean();
    const keys = Object.keys(document ?? {});

    for (const secret of [
      'JWT_PRIVATE_KEY',
      'SMTP_PASS',
      'TELEGRAM_BOT_TOKEN',
    ]) {
      assert.strictEqual(keys.includes(secret), false);
    }
    assert.ok(
      keys.every(
        (key) =>
          key === '_id' ||
          key === 'createdAt' ||
          key === 'updatedAt' ||
          key === 'appName' ||
          key === 'accessTokenTtlSeconds' ||
          key === 'refreshTokenTtlSeconds' ||
          key === 'mfaPolicy' ||
          key === 'maxSessionsPerUser' ||
          key === 'requireVerifiedEmail' ||
          key === 'invitationTtlMs',
      ),
    );
  });

  test('the repository reads and updates the document', async () => {
    const repository = new GlobalSettingsRepository(GlobalSettingsModel);
    await ensureGlobalSettings(GlobalSettingsModel, {
      appName: 'Global',
      accessTokenTtlSeconds: 120,
    });

    const read = await repository.get();
    assert.strictEqual(read.appName, 'Global');
    assert.strictEqual(read.accessTokenTtlSeconds, 120);

    await repository.update({
      set: { appName: 'Updated' },
      unset: ['accessTokenTtlSeconds'],
    });

    const updated = await repository.get();
    assert.strictEqual(updated.appName, 'Updated');
    assert.strictEqual(updated.accessTokenTtlSeconds, undefined);
  });

  test('AC-5: the global document wins over the environment in the service', async () => {
    const application = await fixture.create<Application>(
      'Application',
      ApplicationFactory.generate(),
    );
    await ensureGlobalSettings(GlobalSettingsModel, { appName: 'Global' });
    process.env.APP_NAME = 'Environment';

    try {
      const service = new SettingsService(
        new ApplicationsService(ApplicationModel),
        new GlobalSettingsRepository(GlobalSettingsModel),
      );

      const global = await service.resolveGlobal();
      assert.deepStrictEqual(global.appName, {
        value: 'Global',
        source: 'global',
      });

      const applicationPolicy = await service.resolveForApplication(
        application._id.toString(),
      );
      assert.deepStrictEqual(applicationPolicy.appName, {
        value: 'Global',
        source: 'global',
      });
    } finally {
      delete process.env.APP_NAME;
    }
  });
});
