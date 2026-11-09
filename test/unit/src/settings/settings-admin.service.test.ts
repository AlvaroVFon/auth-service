import { AuditEvent } from '../../../../src/audit';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../../../src/common/exceptions/base.exception';
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

describe('SettingsAdminService.updateApplication', () => {
  const buildResolvedWith = (appName: {
    value: string;
    source: 'application' | 'global';
  }): ResolvedSettings => {
    const resolved = buildResolved();
    resolved.appName = appName;
    return resolved;
  };

  const build = (
    options: {
      found?: boolean;
      before?: ResolvedSettings;
      after?: ResolvedSettings;
      updateError?: Error;
    } = {},
  ) => {
    const record = mock.fn(async () => {});
    const updateApplicationSettings = mock.fn(async () => {
      if (options.updateError) {
        throw options.updateError;
      }
      return (
        options.after ??
        buildResolvedWith({ value: 'Panel', source: 'application' })
      );
    });
    const findAssignableById = mock.fn(async () =>
      options.found === false ? null : { _id: 'app-1' },
    );
    const service = new SettingsAdminService(
      {
        resolveForApplication: async () =>
          options.before ??
          buildResolvedWith({ value: 'Global', source: 'global' }),
        resolveGlobal: async () => buildResolved(),
        updateApplicationSettings,
        updateGlobalSettings: async () => buildResolved(),
      } satisfies SettingsPort,
      { record } as never,
      { findAssignableById } as never,
    );

    return { service, record, updateApplicationSettings, findAssignableById };
  };

  test('writes the patch and audits only the changed field', async () => {
    const { service, record, updateApplicationSettings } = build();

    const view = await service.updateApplication(
      'app-1',
      { appName: 'Panel' },
      'actor-1',
    );

    assert.strictEqual(view.settings.appName, 'Panel');
    assert.deepStrictEqual(updateApplicationSettings.mock.calls[0]?.arguments, [
      'app-1',
      { appName: 'Panel' },
    ]);
    const event = record.mock.calls[0]?.arguments[0] as Record<string, unknown>;
    assert.strictEqual(event.event, AuditEvent.SETTINGS_UPDATED);
    assert.strictEqual(event.applicationId, 'app-1');
    assert.strictEqual(event.actorId, 'actor-1');
    assert.deepStrictEqual(event.fields, ['appName']);
  });

  test('does not audit a patch that changes no value or source', async () => {
    const unchanged = buildResolvedWith({
      value: 'Panel',
      source: 'application',
    });
    const { service, record } = build({
      before: unchanged,
      after: unchanged,
    });

    await service.updateApplication('app-1', { appName: 'Panel' }, 'actor-1');

    assert.strictEqual(record.mock.callCount(), 0);
  });

  test('rejects an unknown application without writing or auditing', async () => {
    const { service, record, updateApplicationSettings } = build({
      found: false,
    });

    await assert.rejects(
      service.updateApplication('missing', { appName: 'Panel' }),
      new EntityNotFoundError('Application not found'),
    );
    assert.strictEqual(updateApplicationSettings.mock.callCount(), 0);
    assert.strictEqual(record.mock.callCount(), 0);
  });

  test('propagates a validation error without auditing', async () => {
    const { service, record } = build({
      updateError: new InvalidArgumentError('settings has unknown field'),
    });

    await assert.rejects(
      service.updateApplication('app-1', { slug: 'x' }),
      (error: unknown) => error instanceof Error,
    );
    assert.strictEqual(record.mock.callCount(), 0);
  });
});
