import { Types } from 'mongoose';

import type { Application } from '../../../../src/applications/applications.interface';
import { ApplicationModel } from '../../../../src/applications/applications.schema';
import { ApplicationsService } from '../../../../src/applications/applications.service';
import { MfaPolicy } from '../../../../src/settings/settings.interface';
import type { ApplicationSettings } from '../../../../src/settings/settings.interface';
import { SettingsService } from '../../../../src/settings/settings.service';
import fixture from '../../../fixtures';
import { ApplicationFactory } from '../../../helpers/factories/application.factory';

describe('SettingsService persistence', () => {
  const serviceFor = (global: Partial<ApplicationSettings> = {}) =>
    new SettingsService(new ApplicationsService(ApplicationModel), {
      get: async () => global,
    });

  test('resolves overrides from the persisted Mongoose subdocument', async () => {
    const application = await fixture.create<Application>(
      'Application',
      ApplicationFactory.generate({
        settings: {
          accessTokenTtlSeconds: 120,
          appName: 'Panel',
          mfaPolicy: MfaPolicy.REQUIRED,
        },
      }),
    );

    const resolved = await serviceFor({
      maxSessionsPerUser: 7,
    }).resolveForApplication(application._id.toString());

    assert.deepStrictEqual(resolved.accessTokenTtlSeconds, {
      value: 120,
      source: 'application',
    });
    assert.deepStrictEqual(resolved.appName, {
      value: 'Panel',
      source: 'application',
    });
    assert.deepStrictEqual(resolved.mfaPolicy, {
      value: MfaPolicy.REQUIRED,
      source: 'application',
    });
    assert.deepStrictEqual(resolved.maxSessionsPerUser, {
      value: 7,
      source: 'global',
    });
  });

  test('accepts a Mongoose document from the global port', async () => {
    const application = await fixture.create<Application>(
      'Application',
      ApplicationFactory.generate({ settings: { appName: 'Stored' } }),
    );
    const document = await ApplicationModel.findById(application._id);

    const service = new SettingsService(
      new ApplicationsService(ApplicationModel),
      { get: async () => document!.settings as never },
    );

    const resolved = await service.resolveGlobal();

    assert.deepStrictEqual(resolved.appName, {
      value: 'Stored',
      source: 'global',
    });
  });

  test('an unknown application inherits the global configuration', async () => {
    const resolved = await serviceFor({
      maxSessionsPerUser: 9,
    }).resolveForApplication('64b64c4f4f4f4f4f4f4f4f4f');

    assert.deepStrictEqual(resolved.maxSessionsPerUser, {
      value: 9,
      source: 'global',
    });
  });
});

describe('SettingsService persistence of writes', () => {
  test('persists the subdocument and reflects the change in the next read', async () => {
    const application = await fixture.create<Application>(
      'Application',
      ApplicationFactory.generate(),
    );
    const applications = new ApplicationsService(ApplicationModel);
    const service = new SettingsService(
      applications,
      { get: async () => ({}) },
      applications,
    );
    const applicationId = application._id.toString();

    const before = await service.resolveForApplication(applicationId);
    assert.strictEqual(before.appName.source, 'default');

    const { resolved: updated, applied } =
      await service.updateApplicationSettings(applicationId, {
        accessTokenTtlSeconds: 120,
        appName: 'Panel',
      });

    assert.deepStrictEqual(applied, {
      set: { accessTokenTtlSeconds: 120, appName: 'Panel' },
      unset: [],
    });
    assert.deepStrictEqual(updated.accessTokenTtlSeconds, {
      value: 120,
      source: 'application',
    });
    assert.deepStrictEqual(updated.appName, {
      value: 'Panel',
      source: 'application',
    });

    const persisted = await ApplicationModel.findById(application._id);
    assert.strictEqual(persisted?.settings?.accessTokenTtlSeconds, 120);
    assert.strictEqual(persisted?.settings?.appName, 'Panel');

    const after = await service.resolveForApplication(applicationId);
    assert.deepStrictEqual(after.appName, {
      value: 'Panel',
      source: 'application',
    });
  });

  test('removes an override when the patch sends null', async () => {
    const application = await fixture.create<Application>(
      'Application',
      ApplicationFactory.generate({ settings: { appName: 'Own' } }),
    );
    const applications = new ApplicationsService(ApplicationModel);
    const service = new SettingsService(
      applications,
      { get: async () => ({ maxSessionsPerUser: 7 }) },
      applications,
    );

    const { resolved, applied } = await service.updateApplicationSettings(
      application._id.toString(),
      { appName: null },
    );

    assert.deepStrictEqual(applied, { set: {}, unset: ['appName'] });
    assert.strictEqual(resolved.appName.source, 'default');

    const persisted = await ApplicationModel.findById(application._id);
    assert.strictEqual(persisted?.settings?.appName, undefined);
    assert.strictEqual(persisted?.settings?.maxSessionsPerUser, undefined);
  });
});

describe('SettingsService empty patches', () => {
  test('an empty patch still reports a missing application', async () => {
    const applications = new ApplicationsService(ApplicationModel);
    const service = new SettingsService(
      applications,
      { get: async () => ({}) },
      applications,
    );

    await assert.rejects(
      service.updateApplicationSettings(new Types.ObjectId().toString(), {}),
      { name: 'EntityNotFoundError' },
    );
  });

  test('an empty patch on an existing application is a no-op', async () => {
    const application = await fixture.create<Application>(
      'Application',
      ApplicationFactory.generate({ settings: { appName: 'Kept' } }),
    );
    const applications = new ApplicationsService(ApplicationModel);
    const service = new SettingsService(
      applications,
      { get: async () => ({}) },
      applications,
    );

    const { resolved, applied } = await service.updateApplicationSettings(
      application._id.toString(),
      {},
    );

    assert.deepStrictEqual(applied, { set: {}, unset: [] });
    assert.deepStrictEqual(resolved.appName, {
      value: 'Kept',
      source: 'application',
    });
  });
});
