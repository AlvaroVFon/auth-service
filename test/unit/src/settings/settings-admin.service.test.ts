import { AuditEvent } from '../../../../src/audit';
import {
  SETTINGS_CODE_DEFAULTS,
  SETTINGS_FIELDS,
  SettingsAdminService,
  type ResolvedSettings,
  type SettingsPort,
} from '../../../../src/settings';

const buildResolved = (): ResolvedSettings => {
  const resolved = {} as ResolvedSettings;

  for (const field of SETTINGS_FIELDS) {
    (resolved as Record<string, unknown>)[field] = {
      value: SETTINGS_CODE_DEFAULTS[field],
      source: 'default',
    };
  }

  return resolved;
};

describe('SettingsAdminService', () => {
  const buildService = () => {
    const record = mock.fn(async () => {});
    const updateGlobalSettings = mock.fn(
      async (patch: Record<string, unknown>) => {
        const resolved = buildResolved();
        if (patch.appName !== undefined) {
          resolved.appName = {
            value: patch.appName as string,
            source: 'global',
          };
        }
        return resolved;
      },
    );
    const service = new SettingsAdminService(
      {
        resolveForApplication: async () => buildResolved(),
        resolveGlobal: async () => buildResolved(),
        updateApplicationSettings: async () => buildResolved(),
        updateGlobalSettings,
      } satisfies SettingsPort,
      { record } as never,
    );

    return { service, record, updateGlobalSettings };
  };

  test('returns the effective settings with sources and defaults', async () => {
    const { service } = buildService();

    const view = await service.getGlobal();

    assert.strictEqual(view.settings.appName, SETTINGS_CODE_DEFAULTS.appName);
    assert.strictEqual(view.sources.appName, 'default');
    assert.deepStrictEqual(view.defaults, SETTINGS_CODE_DEFAULTS);
  });

  test('audits the changed fields and the actor without an application id', async () => {
    const { service, record } = buildService();

    const view = await service.updateGlobal({ appName: 'Panel' }, 'actor-1');

    assert.deepStrictEqual(view.settings.appName, 'Panel');
    assert.strictEqual(view.sources.appName, 'global');
    assert.strictEqual(record.mock.callCount(), 1);
    const event = record.mock.calls[0]?.arguments[0] as Record<string, unknown>;
    assert.strictEqual(event.event, AuditEvent.SETTINGS_UPDATED);
    assert.deepStrictEqual(event.fields, ['appName']);
    assert.strictEqual(event.actorId, 'actor-1');
    assert.strictEqual('applicationId' in event, false);
  });

  test('does not audit a patch that resends the current value', async () => {
    const record = mock.fn(async () => {});
    const service = new SettingsAdminService(
      {
        resolveForApplication: async () => buildResolved(),
        resolveGlobal: async () => buildResolved(),
        updateApplicationSettings: async () => buildResolved(),
        updateGlobalSettings: async () => buildResolved(),
      } satisfies SettingsPort,
      { record } as never,
    );

    await service.updateGlobal(
      { appName: SETTINGS_CODE_DEFAULTS.appName },
      'actor-1',
    );

    assert.strictEqual(record.mock.callCount(), 0);
  });

  test('audits a source-only transition', async () => {
    const record = mock.fn(async () => {});
    const inherited = buildResolved();
    const overridden = buildResolved();
    overridden.appName = {
      value: SETTINGS_CODE_DEFAULTS.appName,
      source: 'global',
    };
    const service = new SettingsAdminService(
      {
        resolveForApplication: async () => inherited,
        resolveGlobal: async () => inherited,
        updateApplicationSettings: async () => inherited,
        updateGlobalSettings: async () => overridden,
      } satisfies SettingsPort,
      { record } as never,
    );

    await service.updateGlobal(
      { appName: SETTINGS_CODE_DEFAULTS.appName },
      'actor-1',
    );

    assert.strictEqual(record.mock.callCount(), 1);
    const event = record.mock.calls[0]?.arguments[0] as
      | { fields: string[] }
      | undefined;
    assert.deepStrictEqual(event?.fields, ['appName']);
  });

  test('does not audit an empty patch', async () => {
    const { service, record } = buildService();

    await service.updateGlobal({}, 'actor-1');

    assert.strictEqual(record.mock.callCount(), 0);
  });
});
