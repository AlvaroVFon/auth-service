import { Types } from 'mongoose';

import type { ApplicationsPort } from '../../../../src/applications';
import type { Application } from '../../../../src/applications/applications.interface';
import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import {
  MfaPolicy,
  SETTINGS_CODE_DEFAULTS,
  SettingsCache,
  SettingsService,
  type ApplicationSettingsWriterPort,
  type GlobalSettingsPort,
  type SettingsChanges,
} from '../../../../src/settings';
import type { ApplicationSettings } from '../../../../src/settings/settings.interface';

const ENV_KEYS = [
  'JWT_EXPIRATION',
  'JWT_REFRESH_EXPIRATION',
  'JWT_REFRESH_EXPIRES_IN',
  'MAX_SESSIONS_PER_USER',
  'INVITATION_LINK_EXPIRATION_MS',
  'APP_NAME',
] as const;

const APP_ID = new Types.ObjectId().toString();

const buildApplication = (settings?: ApplicationSettings): Application => ({
  _id: new Types.ObjectId(APP_ID),
  name: 'Application',
  slug: 'application',
  audience: 'application-audience',
  active: true,
  ...(settings === undefined ? {} : { settings }),
});

const buildService = ({
  application,
  global = {},
  findById,
  writer,
  cache,
}: {
  application?: Application | null;
  global?: Partial<ApplicationSettings>;
  findById?: (id: string) => Promise<Application | null>;
  writer?: ApplicationSettingsWriterPort;
  cache?: SettingsCache<unknown>;
}) =>
  new SettingsService(
    {
      findById: findById ?? (async () => application ?? null),
    } as unknown as ApplicationsPort,
    {
      get: async () => global,
    } as GlobalSettingsPort,
    writer,
    cache as never,
  );

describe('SettingsService', () => {
  const originalEnv: Record<string, string | undefined> = {};

  before(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
    }
  });

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  test('AC-1: the application override wins and is marked as its own', async () => {
    process.env.JWT_EXPIRATION = '600';
    const service = buildService({
      application: buildApplication({
        accessTokenTtlSeconds: 120,
        appName: 'Panel',
      }),
      global: { accessTokenTtlSeconds: 300 },
    });

    const resolved = await service.resolveForApplication(APP_ID);

    assert.deepStrictEqual(resolved.accessTokenTtlSeconds, {
      value: 120,
      source: 'application',
    });
    assert.deepStrictEqual(resolved.appName, {
      value: 'Panel',
      source: 'application',
    });
  });

  test('AC-2: a missing override inherits the global value', async () => {
    process.env.JWT_EXPIRATION = '600';
    const service = buildService({
      application: buildApplication({ mfaPolicy: MfaPolicy.REQUIRED }),
      global: { accessTokenTtlSeconds: 300 },
    });

    const resolved = await service.resolveForApplication(APP_ID);

    assert.deepStrictEqual(resolved.accessTokenTtlSeconds, {
      value: 300,
      source: 'global',
    });
    assert.deepStrictEqual(resolved.mfaPolicy, {
      value: MfaPolicy.REQUIRED,
      source: 'application',
    });
  });

  test('AC-3: without database values the environment value is inherited', async () => {
    process.env.JWT_EXPIRATION = '600';
    const service = buildService({
      application: buildApplication(),
      global: {},
    });

    const resolved = await service.resolveForApplication(APP_ID);

    assert.deepStrictEqual(resolved.accessTokenTtlSeconds, {
      value: 600,
      source: 'environment',
    });
  });

  test('AC-4: without database or environment values the code default applies', async () => {
    const service = buildService({ application: buildApplication() });

    const resolved = await service.resolveForApplication(APP_ID);

    assert.deepStrictEqual(resolved.accessTokenTtlSeconds, {
      value: SETTINGS_CODE_DEFAULTS.accessTokenTtlSeconds,
      source: 'default',
    });
    assert.deepStrictEqual(resolved.refreshTokenTtlSeconds, {
      value: SETTINGS_CODE_DEFAULTS.refreshTokenTtlSeconds,
      source: 'default',
    });
    assert.deepStrictEqual(resolved.maxSessionsPerUser, {
      value: SETTINGS_CODE_DEFAULTS.maxSessionsPerUser,
      source: 'default',
    });
    assert.deepStrictEqual(resolved.invitationTtlMs, {
      value: SETTINGS_CODE_DEFAULTS.invitationTtlMs,
      source: 'default',
    });
    assert.deepStrictEqual(resolved.appName, {
      value: SETTINGS_CODE_DEFAULTS.appName,
      source: 'default',
    });
    assert.deepStrictEqual(resolved.mfaPolicy, {
      value: MfaPolicy.OPTIONAL,
      source: 'default',
    });
    assert.deepStrictEqual(resolved.requireVerifiedEmail, {
      value: true,
      source: 'default',
    });
  });

  test('AC-5: an unknown application resolves the global configuration', async () => {
    const service = buildService({
      application: null,
      global: { maxSessionsPerUser: 7 },
    });

    const resolved = await service.resolveForApplication(
      new Types.ObjectId().toString(),
    );

    assert.deepStrictEqual(resolved.maxSessionsPerUser, {
      value: 7,
      source: 'global',
    });
  });

  test('AC-5: a malformed application id does not raise an internal error', async () => {
    const service = buildService({
      findById: async () => {
        throw new InvalidArgumentError('Invalid id');
      },
    });

    const resolved = await service.resolveForApplication('not-an-id');

    assert.strictEqual(resolved.accessTokenTtlSeconds.source, 'default');
  });

  test('AC-6: an invalid stored value is rejected instead of propagated', async () => {
    const service = buildService({
      application: buildApplication({ accessTokenTtlSeconds: -1 }),
    });

    await assert.rejects(
      () => service.resolveForApplication(APP_ID),
      (error: Error) =>
        error instanceof InvalidArgumentError &&
        error.message ===
          'accessTokenTtlSeconds must be a positive integer (seconds)',
    );
  });

  test('AC-6: an invalid global value is rejected instead of propagated', async () => {
    const service = buildService({
      global: { mfaPolicy: 'sometimes' as MfaPolicy },
    });

    await assert.rejects(() => service.resolveGlobal(), InvalidArgumentError);
  });

  test('reads the environment at resolution time, not in the constructor', async () => {
    // Without a cache every resolution reads the current environment.
    const service = buildService({
      application: buildApplication(),
      cache: new SettingsCache(0) as never,
    });

    process.env.JWT_EXPIRATION = '100';
    const first = await service.resolveForApplication(APP_ID);

    process.env.JWT_EXPIRATION = '200';
    const second = await service.resolveForApplication(APP_ID);

    assert.strictEqual(first.accessTokenTtlSeconds.value, 100);
    assert.strictEqual(second.accessTokenTtlSeconds.value, 200);
  });

  test('resolveGlobal never reads the application', async () => {
    const findById = mock.fn(async () => buildApplication());
    const service = buildService({ findById, global: { appName: 'Global' } });

    const resolved = await service.resolveGlobal();

    assert.deepStrictEqual(resolved.appName, {
      value: 'Global',
      source: 'global',
    });
    assert.strictEqual(findById.mock.callCount(), 0);
  });

  test('uses the refresh-token legacy alias when the canonical one is unset', async () => {
    process.env.JWT_REFRESH_EXPIRES_IN = '7200';
    const service = buildService({ application: buildApplication() });

    const resolved = await service.resolveForApplication(APP_ID);

    assert.deepStrictEqual(resolved.refreshTokenTtlSeconds, {
      value: 7200,
      source: 'environment',
    });
  });
});

describe('SettingsService writes and cache', () => {
  const createMutableService = () => {
    const store: {
      settings: ApplicationSettings;
      global: Partial<ApplicationSettings>;
    } = {
      settings: { appName: 'Old' },
      global: { maxSessionsPerUser: 7 },
    };
    const application = buildApplication(store.settings);
    let now = 0;
    const cache = new SettingsCache(1_000, 500, () => now) as never;
    const updateSettings = mock.fn(
      async (_id: string, changes: SettingsChanges) => {
        for (const [field, value] of Object.entries(changes.set)) {
          (store.settings as Record<string, unknown>)[field] = value;
        }
        for (const field of changes.unset) {
          delete (store.settings as Record<string, unknown>)[field];
        }
      },
    );
    const writer: ApplicationSettingsWriterPort = {
      updateSettings,
    };
    const update = mock.fn(async () => {});
    const service = new SettingsService(
      {
        findById: async () => application,
      } as unknown as ApplicationsPort,
      {
        get: async () => store.global,
        update: async (changes: SettingsChanges) => {
          await update();
          for (const [field, value] of Object.entries(changes.set)) {
            (store.global as Record<string, unknown>)[field] = value;
          }
          for (const field of changes.unset) {
            delete (store.global as Record<string, unknown>)[field];
          }
        },
      } as GlobalSettingsPort,
      writer,
      cache,
    );

    return {
      service,
      store,
      writer,
      updateSettings,
      update,
      advance: (ms: number) => {
        now += ms;
      },
    };
  };

  test('AC-1: a write is visible in the next read without a restart', async () => {
    const { service } = createMutableService();

    const before = await service.resolveForApplication(APP_ID);
    assert.deepStrictEqual(before.appName, {
      value: 'Old',
      source: 'application',
    });

    const after = await service.updateApplicationSettings(APP_ID, {
      appName: 'New',
    });

    assert.deepStrictEqual(after.appName, {
      value: 'New',
      source: 'application',
    });
  });

  test('AC-2: writing one application keeps the other cache entries', async () => {
    const applications = new Map<string, Application>();
    const first: Application = {
      ...buildApplication({ appName: 'First' }),
      _id: new Types.ObjectId(),
    };
    const second: Application = {
      ...buildApplication({ appName: 'Second' }),
      _id: new Types.ObjectId(),
    };
    applications.set(first._id.toString(), first);
    applications.set(second._id.toString(), second);

    const service = new SettingsService(
      {
        findById: async (id: string) => applications.get(id) ?? null,
      } as unknown as ApplicationsPort,
      { get: async () => ({}) } as GlobalSettingsPort,
      {
        updateSettings: async (id, changes) => {
          const application = applications.get(id);
          for (const [field, value] of Object.entries(changes.set)) {
            (application!.settings as Record<string, unknown>)[field] = value;
          }
        },
      },
      new SettingsCache(60_000),
    );

    await service.resolveForApplication(first._id.toString());
    await service.resolveForApplication(second._id.toString());

    await service.updateApplicationSettings(first._id.toString(), {
      appName: 'First updated',
    });

    // The second application changed behind the cache: it must still be served
    // from cache because its entry was not invalidated.
    (second.settings as Record<string, unknown>).appName = 'Second changed';

    const cachedSecond = await service.resolveForApplication(
      second._id.toString(),
    );
    assert.deepStrictEqual(cachedSecond.appName, {
      value: 'Second',
      source: 'application',
    });

    const updatedFirst = await service.resolveForApplication(
      first._id.toString(),
    );
    assert.deepStrictEqual(updatedFirst.appName, {
      value: 'First updated',
      source: 'application',
    });
  });

  test('AC-3: the entry is refreshed after the TTL', async () => {
    let now = 0;
    const application = buildApplication({ appName: 'Initial' });
    const service = new SettingsService(
      {
        findById: async () => application,
      } as unknown as ApplicationsPort,
      { get: async () => ({}) } as GlobalSettingsPort,
      undefined,
      new SettingsCache(1_000, 500, () => now),
    );

    await service.resolveForApplication(APP_ID);
    application.settings = { appName: 'Behind the cache' };

    const cached = await service.resolveForApplication(APP_ID);
    assert.strictEqual(cached.appName.value, 'Initial');

    now += 1_000;

    const refreshed = await service.resolveForApplication(APP_ID);
    assert.strictEqual(refreshed.appName.value, 'Behind the cache');
  });

  test('AC-4: an invalid patch never reaches the writer or the cache', async () => {
    const { service, updateSettings } = createMutableService();
    await service.resolveForApplication(APP_ID);

    for (const patch of [
      { accessTokenTtlSeconds: -1 },
      { mfaPolicy: 'sometimes' },
      { maxSessionsPerUser: 0 },
      { unknownField: 1 },
    ]) {
      await assert.rejects(
        service.updateApplicationSettings(APP_ID, patch),
        InvalidArgumentError,
      );
    }

    assert.strictEqual(updateSettings.mock.callCount(), 0);
    const resolved = await service.resolveForApplication(APP_ID);
    assert.strictEqual(resolved.appName.value, 'Old');
  });

  test('AC-5: a null removes the override and inherits again', async () => {
    const { service, store } = createMutableService();
    store.global = { appName: 'Global name' };
    await service.resolveForApplication(APP_ID);

    const resolved = await service.updateApplicationSettings(APP_ID, {
      appName: null,
    });

    assert.deepStrictEqual(resolved.appName, {
      value: 'Global name',
      source: 'global',
    });
    assert.strictEqual('appName' in store.settings, false);
  });

  test('does not cache unknown or malformed application ids', async () => {
    const cache = new SettingsCache(60_000);
    const service = buildService({ findById: async () => null, cache });

    await service.resolveForApplication('not-an-id');

    assert.strictEqual(cache.size, 0);
  });

  test('normalizes the application id in the cache key', async () => {
    const { service } = createMutableService();
    const upperCaseId = APP_ID.toUpperCase();

    const before = await service.resolveForApplication(upperCaseId);
    assert.deepStrictEqual(before.appName, {
      value: 'Old',
      source: 'application',
    });

    await service.updateApplicationSettings(APP_ID, { appName: 'New' });

    // The uppercase spelling must hit the same entry, so the write invalidates
    // it instead of leaving a second stale key behind.
    const after = await service.resolveForApplication(upperCaseId);
    assert.deepStrictEqual(after.appName, {
      value: 'New',
      source: 'application',
    });
  });

  test('a global write invalidates every cached application policy', async () => {
    const store: { global: Partial<ApplicationSettings> } = {
      global: { appName: 'Old global' },
    };
    const application = buildApplication();
    const service = new SettingsService(
      {
        findById: async () => application,
      } as unknown as ApplicationsPort,
      {
        get: async () => store.global,
        update: async (changes: SettingsChanges) => {
          for (const [field, value] of Object.entries(changes.set)) {
            (store.global as Record<string, unknown>)[field] = value;
          }
        },
      } as GlobalSettingsPort,
      undefined,
      new SettingsCache(60_000),
    );

    const before = await service.resolveForApplication(APP_ID);
    assert.deepStrictEqual(before.appName, {
      value: 'Old global',
      source: 'global',
    });

    await service.updateGlobalSettings({ appName: 'New global' });

    // The application does not override appName, so its cached policy embedded
    // the previous global value.
    const after = await service.resolveForApplication(APP_ID);
    assert.deepStrictEqual(after.appName, {
      value: 'New global',
      source: 'global',
    });
  });

  test('an in-flight read does not repopulate the cache after an application write', async () => {
    const application = buildApplication({ appName: 'Old' });
    const staleSnapshot = buildApplication({ appName: 'Old' });
    let release: (() => void) | undefined;
    let first = true;

    const service = new SettingsService(
      {
        findById: async () => {
          if (first) {
            first = false;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            return staleSnapshot;
          }
          return application;
        },
      } as unknown as ApplicationsPort,
      { get: async () => ({}) } as GlobalSettingsPort,
      {
        updateSettings: async (_id, changes) => {
          (application.settings as Record<string, unknown>).appName =
            changes.set.appName;
        },
      },
      new SettingsCache(60_000),
    );

    const inFlight = service.resolveForApplication(APP_ID);
    await service.updateApplicationSettings(APP_ID, { appName: 'New' });
    release?.();
    await inFlight;

    // The stale read must have skipped cache.set; the next read is fresh.
    const resolved = await service.resolveForApplication(APP_ID);
    assert.deepStrictEqual(resolved.appName, {
      value: 'New',
      source: 'application',
    });
  });

  test('an in-flight global read does not repopulate the cache after a global write', async () => {
    const store: { global: Partial<ApplicationSettings> } = {
      global: { appName: 'Old' },
    };
    let release: (() => void) | undefined;
    let first = true;

    const service = new SettingsService(
      { findById: async () => null } as unknown as ApplicationsPort,
      {
        get: async () => {
          if (first) {
            first = false;
            const stale = { ...store.global };
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            return stale;
          }
          return store.global;
        },
        update: async (changes: SettingsChanges) => {
          (store.global as Record<string, unknown>).appName =
            changes.set.appName;
        },
      } as GlobalSettingsPort,
      undefined,
      new SettingsCache(60_000),
    );

    const inFlight = service.resolveGlobal();
    await service.updateGlobalSettings({ appName: 'New' });
    release?.();
    await inFlight;

    const resolved = await service.resolveGlobal();
    assert.deepStrictEqual(resolved.appName, {
      value: 'New',
      source: 'global',
    });
  });

  test('updates and invalidates the global settings', async () => {
    const { service, update } = createMutableService();
    await service.resolveGlobal();

    const resolved = await service.updateGlobalSettings({
      maxSessionsPerUser: 11,
    });

    assert.deepStrictEqual(resolved.maxSessionsPerUser, {
      value: 11,
      source: 'global',
    });
    assert.strictEqual(update.mock.callCount(), 1);
  });
});
