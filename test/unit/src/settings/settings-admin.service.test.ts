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
  type SettingsChanges,
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
        resolveApplicationWithGlobal: async () => ({
          application: buildResolved(),
          global: buildResolved(),
        }),
        resolveGlobal: async () => buildResolved(),
        updateApplicationSettings: async () => ({
          resolved: buildResolved(),
          applied: { set: {}, unset: [] },
        }),
        updateGlobalSettings,
      } satisfies SettingsPort,
      { record } as never,
      {} as never,
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
        resolveApplicationWithGlobal: async () => ({
          application: buildResolved(),
          global: buildResolved(),
        }),
        resolveGlobal: async () => buildResolved(),
        updateApplicationSettings: async () => ({
          resolved: buildResolved(),
          applied: { set: {}, unset: [] },
        }),
        updateGlobalSettings: async () => buildResolved(),
      } satisfies SettingsPort,
      { record } as never,
      {} as never,
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
        resolveApplicationWithGlobal: async () => ({
          application: inherited,
          global: inherited,
        }),
        resolveGlobal: async () => inherited,
        updateApplicationSettings: async () => ({
          resolved: inherited,
          applied: { set: {}, unset: [] },
        }),
        updateGlobalSettings: async () => overridden,
      } satisfies SettingsPort,
      { record } as never,
      {} as never,
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
      applied?: SettingsChanges;
      after?: ResolvedSettings;
      updateError?: Error;
      findError?: Error;
    } = {},
  ) => {
    const record = mock.fn(async () => {});
    const updateApplicationSettings = mock.fn(async () => {
      if (options.updateError) {
        throw options.updateError;
      }
      return {
        resolved:
          options.after ??
          buildResolvedWith({ value: 'Panel', source: 'application' }),
        applied: options.applied ?? { set: { appName: 'Panel' }, unset: [] },
      };
    });
    const findAssignableById = mock.fn(async () => {
      if (options.findError) {
        throw options.findError;
      }
      return options.found === false ? null : { _id: 'app-1' };
    });
    const service = new SettingsAdminService(
      {
        resolveForApplication: async () =>
          buildResolvedWith({ value: 'Global', source: 'global' }),
        resolveGlobal: async () => buildResolved(),
        resolveApplicationWithGlobal: async () => ({
          application: buildResolved(),
          global: buildResolved(),
        }),
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
      after: unchanged,
      applied: { set: {}, unset: [] },
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

  test('forwards a null removal and audits the source transition', async () => {
    const after = buildResolvedWith({ value: 'Global', source: 'global' });
    const { service, record, updateApplicationSettings } = build({
      after,
      applied: { set: {}, unset: ['appName'] },
    });

    await service.updateApplication('app-1', { appName: null }, 'actor-1');

    assert.deepStrictEqual(updateApplicationSettings.mock.calls[0]?.arguments, [
      'app-1',
      { appName: null },
    ]);
    const event = record.mock.calls[0]?.arguments[0] as Record<string, unknown>;
    assert.deepStrictEqual(event.fields, ['appName']);
  });

  test('forwards a mixed patch unchanged and audits both changes', async () => {
    const after = buildResolved();
    after.appName = { value: 'Panel', source: 'application' };
    after.accessTokenTtlSeconds = { value: 120, source: 'application' };
    const { service, record, updateApplicationSettings } = build({
      after,
      applied: {
        set: { appName: 'Panel', accessTokenTtlSeconds: 120 },
        unset: [],
      },
    });

    await service.updateApplication(
      'app-1',
      { appName: 'Panel', accessTokenTtlSeconds: 120 },
      'actor-1',
    );

    assert.deepStrictEqual(updateApplicationSettings.mock.calls[0]?.arguments, [
      'app-1',
      { appName: 'Panel', accessTokenTtlSeconds: 120 },
    ]);
    const event = record.mock.calls[0]?.arguments[0] as Record<string, unknown>;
    assert.deepStrictEqual(event.fields, ['accessTokenTtlSeconds', 'appName']);
  });

  test('forwards a mixed null and value patch and audits both changes', async () => {
    const after = buildResolved();
    after.appName = { value: 'Global', source: 'global' };
    after.accessTokenTtlSeconds = { value: 120, source: 'application' };
    const { service, record, updateApplicationSettings } = build({
      after,
      applied: { set: { accessTokenTtlSeconds: 120 }, unset: ['appName'] },
    });

    await service.updateApplication(
      'app-1',
      { appName: null, accessTokenTtlSeconds: 120 },
      'actor-1',
    );

    assert.deepStrictEqual(updateApplicationSettings.mock.calls[0]?.arguments, [
      'app-1',
      { appName: null, accessTokenTtlSeconds: 120 },
    ]);
    const event = record.mock.calls[0]?.arguments[0] as Record<string, unknown>;
    assert.deepStrictEqual(event.fields, ['accessTokenTtlSeconds', 'appName']);
  });

  test('does not audit a null-only no-op', async () => {
    const unchanged = buildResolvedWith({
      value: 'Global',
      source: 'global',
    });
    const { service, record } = build({
      after: unchanged,
      applied: { set: {}, unset: [] },
    });

    await service.updateApplication('app-1', { appName: null }, 'actor-1');

    assert.strictEqual(record.mock.callCount(), 0);
  });

  test('rejects a malformed application id without writing', async () => {
    const { service, record, updateApplicationSettings } = build({
      findError: new InvalidArgumentError('Invalid ID format'),
    });

    await assert.rejects(
      service.updateApplication('bad-id', { appName: 'Panel' }, 'actor-1'),
      new InvalidArgumentError('Invalid ID format'),
    );
    assert.strictEqual(updateApplicationSettings.mock.callCount(), 0);
    assert.strictEqual(record.mock.callCount(), 0);
  });

  test('propagates a validation error without auditing', async () => {
    const { service, record } = build({
      updateError: new InvalidArgumentError('settings has unknown field'),
    });

    await assert.rejects(
      service.updateApplication('app-1', { slug: 'x' } as unknown as Record<
        string,
        never
      >),
      (error: unknown) =>
        error instanceof InvalidArgumentError &&
        /unknown field/.test(error.message),
    );
    assert.strictEqual(record.mock.callCount(), 0);
  });
});
