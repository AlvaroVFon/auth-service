import type { Application } from '../../../../src/applications/applications.interface';
import { ApplicationModel } from '../../../../src/applications/applications.schema';
import { ApplicationsService } from '../../../../src/applications/applications.service';
import { AuditService, createAuditEventModel } from '../../../../src/audit';
import { EntityNotFoundError } from '../../../../src/common/exceptions/base.exception';
import type { ApplicationSettings } from '../../../../src/settings';
import { SettingsAdminService } from '../../../../src/settings/settings-admin.service';
import { SettingsService } from '../../../../src/settings/settings.service';
import fixture from '../../../fixtures';
import { ApplicationFactory } from '../../../helpers/factories/application.factory';
import { silentLogger } from '../../../mocks/logger.mock';

describe('SettingsAdminService application writes', () => {
  const ACTOR_ID = '507f191e810c19729de860ea';
  const build = () => {
    const applications = new ApplicationsService(ApplicationModel);
    const settings = new SettingsService(
      applications,
      { get: async () => ({ appName: 'Global Panel' }) },
      applications,
    );
    const auditModel = createAuditEventModel();
    const audit = new AuditService(auditModel, silentLogger);
    const admin = new SettingsAdminService(settings, audit, applications);

    return { admin, settings, auditModel };
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
      ACTOR_ID,
    );
    assert.strictEqual(written.sources.accessTokenTtlSeconds, 'application');
    assert.strictEqual(written.settings.accessTokenTtlSeconds, 120);

    const reread = await settings.resolveForApplication(id);
    assert.strictEqual(reread.accessTokenTtlSeconds.value, 120);
    assert.strictEqual(reread.accessTokenTtlSeconds.source, 'application');

    const removed = await admin.updateApplication(
      id,
      { accessTokenTtlSeconds: null },
      ACTOR_ID,
    );
    assert.notStrictEqual(removed.sources.accessTokenTtlSeconds, 'application');

    const afterRemoval = await settings.resolveForApplication(id);
    assert.notStrictEqual(
      afterRemoval.accessTokenTtlSeconds.source,
      'application',
    );

    const events = await fixture.find('AuditEvent', {
      event: 'settings.updated',
      applicationId: application._id,
    });
    assert.strictEqual(events.length, 2);
    const first = events[0] as {
      actorId?: { toString(): string };
      fields?: string[];
    };
    const second = events[1] as { fields?: string[] };
    assert.strictEqual(first?.actorId?.toString(), ACTOR_ID);
    assert.deepStrictEqual(first?.fields, ['accessTokenTtlSeconds']);
    assert.deepStrictEqual(second?.fields, ['accessTokenTtlSeconds']);
  });

  test('rejects an invalid patch without modifying the document', async () => {
    const { admin } = build();
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
    assert.strictEqual(
      (await fixture.find('AuditEvent', { event: 'settings.updated' })).length,
      0,
    );
  });

  test('rejects an inactive or unknown application without writing', async () => {
    const { admin } = build();
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
    assert.strictEqual(
      (await fixture.find('AuditEvent', { event: 'settings.updated' })).length,
      0,
    );
  });
});
