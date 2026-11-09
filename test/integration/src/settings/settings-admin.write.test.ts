import type { Application } from '../../../../src/applications/applications.interface';
import { ApplicationModel } from '../../../../src/applications/applications.schema';
import { ApplicationsService } from '../../../../src/applications/applications.service';
import { EntityNotFoundError } from '../../../../src/common/exceptions/base.exception';
import type { ApplicationSettings } from '../../../../src/settings';
import { SettingsAdminService } from '../../../../src/settings/settings-admin.service';
import { SettingsService } from '../../../../src/settings/settings.service';
import fixture from '../../../fixtures';
import { ApplicationFactory } from '../../../helpers/factories/application.factory';

describe('SettingsAdminService application writes', () => {
  const build = (record = mock.fn(async () => {})) => {
    const applications = new ApplicationsService(ApplicationModel);
    const settings = new SettingsService(
      applications,
      { get: async () => ({ appName: 'Global Panel' }) },
      applications,
    );
    const admin = new SettingsAdminService(
      settings,
      { record } as never,
      applications,
    );

    return { admin, settings, record };
  };

  const createApplication = (overrides: Partial<Application> = {}) =>
    fixture.create<Application>(
      'Application',
      ApplicationFactory.generate(overrides),
    );

  test('persists an override, then null removes it and the cache is refreshed', async () => {
    const { admin, settings } = build();
    const application = await createApplication();
    const id = application._id.toString();

    const written = await admin.updateApplication(
      id,
      { accessTokenTtlSeconds: 120 },
      'actor-1',
    );
    assert.strictEqual(written.sources.accessTokenTtlSeconds, 'application');
    assert.strictEqual(written.settings.accessTokenTtlSeconds, 120);

    const reread = await settings.resolveForApplication(id);
    assert.strictEqual(reread.accessTokenTtlSeconds.value, 120);
    assert.strictEqual(reread.accessTokenTtlSeconds.source, 'application');

    const removed = await admin.updateApplication(
      id,
      { accessTokenTtlSeconds: null },
      'actor-1',
    );
    assert.notStrictEqual(removed.sources.accessTokenTtlSeconds, 'application');

    const afterRemoval = await settings.resolveForApplication(id);
    assert.notStrictEqual(
      afterRemoval.accessTokenTtlSeconds.source,
      'application',
    );
  });

  test('rejects an invalid patch without modifying the document', async () => {
    const { admin, record } = build();
    const application = await createApplication();
    const id = application._id.toString();

    await assert.rejects(
      admin.updateApplication(id, { accessTokenTtlSeconds: -1 }),
      /positive/i,
    );

    const stored = await ApplicationModel.findById(id).lean<Application>();
    assert.strictEqual(
      (stored?.settings as ApplicationSettings | undefined)
        ?.accessTokenTtlSeconds,
      undefined,
    );
    assert.strictEqual(record.mock.callCount(), 0);
  });

  test('rejects an inactive or unknown application without writing', async () => {
    const { admin, record } = build();
    const inactive = await createApplication({ active: false });

    await assert.rejects(
      admin.updateApplication(inactive._id.toString(), { appName: 'Nope' }),
      new EntityNotFoundError('Application not found'),
    );
    await assert.rejects(
      admin.updateApplication('507f191e810c19729de860ea', {
        appName: 'Nope',
      }),
      new EntityNotFoundError('Application not found'),
    );
    assert.strictEqual(record.mock.callCount(), 0);
  });
});
