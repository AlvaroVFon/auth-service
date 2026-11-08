import { Types } from 'mongoose';

import type { ApplicationsPort } from '../../../../src/applications';
import type { Application } from '../../../../src/applications/applications.interface';
import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import {
  MfaPolicy,
  SETTINGS_CODE_DEFAULTS,
  SettingsService,
  type GlobalSettingsPort,
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
}: {
  application?: Application | null;
  global?: Partial<ApplicationSettings>;
  findById?: (id: string) => Promise<Application | null>;
}) =>
  new SettingsService(
    {
      findById: findById ?? (async () => application ?? null),
    } as unknown as ApplicationsPort,
    {
      get: async () => global,
    } as GlobalSettingsPort,
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
    const service = buildService({ application: buildApplication() });

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
