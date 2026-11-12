import type { Application, ApplicationsPort } from '../applications';
import { OBJECTID_REGEX } from '../common/constants/regex';
import { InvalidArgumentError } from '../common/exceptions/base.exception';
import { SettingsCache } from './settings.cache';
import {
  resolveEnvironmentSettings,
  SETTINGS_CODE_DEFAULTS,
} from './settings.defaults';
import type { ApplicationSettings } from './settings.interface';
import type {
  ApplicationSettingsWriterPort,
  GlobalSettingsPort,
  RateLimitPolicy,
  RateLimitRoute,
  ResolvedSetting,
  ResolvedSettings,
  SettingsChanges,
  SettingsPort,
} from './settings.port';
import {
  isSettingsField,
  SETTINGS_FIELDS,
  SETTINGS_VALIDATION_MESSAGES,
  type SettingsField,
  validateApplicationSettings,
} from './settings.validation';

const GLOBAL_CACHE_KEY = 'global';

/** Settings fields that back each route's rate-limit policy. */
const RATE_LIMIT_FIELDS: Record<
  RateLimitRoute,
  { max: SettingsField; windowMs: SettingsField }
> = {
  login: { max: 'loginRateLimitMax', windowMs: 'loginRateLimitWindowMs' },
  refresh: { max: 'refreshRateLimitMax', windowMs: 'refreshRateLimitWindowMs' },
  mfa: { max: 'mfaRateLimitMax', windowMs: 'mfaRateLimitWindowMs' },
  management: {
    max: 'managementRateLimitMax',
    windowMs: 'managementRateLimitWindowMs',
  },
};

const applicationCacheKey = (applicationId: string): string =>
  `application:${applicationId.toLowerCase()}`;

/**
 * `ApplicationsPort.findById` returns a hydrated document, so `settings` is a
 * Mongoose `SingleNested` subdocument with internal keys that the settings
 * validator would reject. `toObject` flattens it; plain objects pass through.
 */
const toPlainSettings = (
  settings: unknown,
): ApplicationSettings | undefined => {
  if (settings === undefined || settings === null) {
    return undefined;
  }

  const document = settings as { toObject?: () => unknown };
  const plain =
    typeof document.toObject === 'function' ? document.toObject() : settings;

  return plain as ApplicationSettings;
};

/**
 * A patch is validated before it touches Mongo or the cache. A `null` value is
 * an explicit request to remove that override, not an invalid value.
 */
const parseSettingsPatch = (
  patch: Record<string, unknown> | null | undefined,
): SettingsChanges => {
  if (
    patch === undefined ||
    patch === null ||
    typeof patch !== 'object' ||
    Array.isArray(patch)
  ) {
    throw new InvalidArgumentError(SETTINGS_VALIDATION_MESSAGES.settings);
  }

  const values: Record<string, unknown> = {};
  const unset: SettingsField[] = [];

  for (const [key, value] of Object.entries(patch)) {
    if (!isSettingsField(key)) {
      throw new InvalidArgumentError(`settings has unknown field '${key}'`);
    }

    if (value === null) {
      unset.push(key);
    } else {
      values[key] = value;
    }
  }

  return { set: validateApplicationSettings(values) ?? {}, unset };
};

export class SettingsService implements SettingsPort {
  /** Incremented on every write; a read only fills the cache if it did not move. */
  private writeGeneration = 0;
  /** Application + global resolved from the same read, for provenance views. */
  private readonly pairCache = new SettingsCache<{
    application: ResolvedSettings;
    global: ResolvedSettings;
  }>();

  constructor(
    private readonly applicationsService: ApplicationsPort,
    private readonly globalSettings: GlobalSettingsPort,
    private readonly applicationSettingsWriter?: ApplicationSettingsWriterPort,
    private readonly cache: SettingsCache<ResolvedSettings> = new SettingsCache(),
  ) {}

  async resolveForApplication(
    applicationId: string,
  ): Promise<ResolvedSettings> {
    const key = applicationCacheKey(applicationId);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // Capture the version before the reads: a write that finishes while this
    // resolution is in flight must not be overwritten by the older value.
    const generation = this.writeGeneration;
    const snapshot = await this.resolveSnapshot(applicationId);

    // Unknown and malformed ids are not cached: they must not evict real
    // application entries or pin a policy for an id that cannot exist.
    if (snapshot.application !== null && this.writeGeneration === generation) {
      this.cache.set(key, snapshot.applicationResolved);
    }

    return snapshot.applicationResolved;
  }

  async resolveRateLimitPolicy(
    applicationId: string | undefined,
    route: RateLimitRoute,
  ): Promise<RateLimitPolicy> {
    const fields = RATE_LIMIT_FIELDS[route];
    const resolved =
      applicationId !== undefined && OBJECTID_REGEX.test(applicationId)
        ? await this.resolveForApplication(applicationId)
        : await this.resolveGlobal();

    return {
      max: resolved[fields.max].value as number,
      windowMs: resolved[fields.windowMs].value as number,
    };
  }

  async resolveApplicationWithGlobal(
    applicationId: string,
  ): Promise<{ application: ResolvedSettings; global: ResolvedSettings }> {
    const key = applicationCacheKey(applicationId);
    const cached = this.pairCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const generation = this.writeGeneration;
    const snapshot = await this.resolveSnapshot(applicationId);
    const pair = {
      application: snapshot.applicationResolved,
      global: snapshot.globalResolved,
    };

    if (snapshot.application !== null && this.writeGeneration === generation) {
      this.cache.set(key, pair.application);
      this.pairCache.set(key, pair);
    }

    return pair;
  }

  private async resolveSnapshot(applicationId: string): Promise<{
    application: Application | null;
    applicationResolved: ResolvedSettings;
    globalResolved: ResolvedSettings;
  }> {
    const [application, global] = await Promise.all([
      this.findApplication(applicationId),
      this.globalSettings.get(),
    ]);

    return {
      application,
      applicationResolved: this.resolve(application?.settings, global),
      globalResolved: this.resolve(undefined, global),
    };
  }

  async resolveGlobal(): Promise<ResolvedSettings> {
    const cached = this.cache.get(GLOBAL_CACHE_KEY);
    if (cached !== undefined) {
      return cached;
    }

    const generation = this.writeGeneration;
    const resolved = this.resolve(undefined, await this.globalSettings.get());

    if (this.writeGeneration === generation) {
      this.cache.set(GLOBAL_CACHE_KEY, resolved);
    }

    return resolved;
  }

  async updateApplicationSettings(
    applicationId: string,
    patch: Record<string, unknown>,
  ): Promise<ResolvedSettings> {
    const changes = parseSettingsPatch(patch);

    if (!this.applicationSettingsWriter) {
      throw new Error('Application settings writer is not configured');
    }

    await this.applicationSettingsWriter.updateSettings(applicationId, changes);
    this.writeGeneration += 1;
    const key = applicationCacheKey(applicationId);
    this.cache.invalidate(key);
    this.pairCache.invalidate(key);

    return this.resolveForApplication(applicationId);
  }

  async updateGlobalSettings(
    patch: Record<string, unknown>,
  ): Promise<ResolvedSettings> {
    const changes = parseSettingsPatch(patch);

    if (!this.globalSettings.update) {
      throw new Error('Global settings writer is not configured');
    }

    await this.globalSettings.update(changes);
    // Every cached application embeds the global layer, so a global write
    // invalidates the whole cache, not only the global entry.
    this.writeGeneration += 1;
    this.cache.clear();
    this.pairCache.clear();

    return this.resolveGlobal();
  }

  /**
   * An unknown or malformed id is not an internal error: the caller asked for
   * a policy that does not exist, so it inherits the global configuration. The
   * format is checked before the lookup so no other validation error is ever
   * downgraded.
   */
  private async findApplication(applicationId: string) {
    if (!OBJECTID_REGEX.test(applicationId)) {
      return null;
    }

    return this.applicationsService.findById(applicationId);
  }

  private resolve(
    application: ApplicationSettings | undefined,
    global: Partial<ApplicationSettings>,
  ): ResolvedSettings {
    const applicationSettings = validateApplicationSettings(
      toPlainSettings(application),
    );
    const globalSettings = validateApplicationSettings(toPlainSettings(global));
    const environment = validateApplicationSettings(
      resolveEnvironmentSettings(),
    );

    const resolved = {} as ResolvedSettings;

    for (const field of SETTINGS_FIELDS) {
      this.assign(
        resolved,
        field,
        this.pick(field, applicationSettings, globalSettings, environment),
      );
    }

    return resolved;
  }

  private pick<K extends SettingsField>(
    field: K,
    application: ApplicationSettings | undefined,
    global: ApplicationSettings | undefined,
    environment: ApplicationSettings | undefined,
  ): ResolvedSetting<NonNullable<ApplicationSettings[K]>> {
    const fromApplication = application?.[field];
    if (fromApplication !== undefined) {
      return { value: fromApplication as never, source: 'application' };
    }

    const fromGlobal = global?.[field];
    if (fromGlobal !== undefined) {
      return { value: fromGlobal as never, source: 'global' };
    }

    const fromEnvironment = environment?.[field];
    if (fromEnvironment !== undefined) {
      return { value: fromEnvironment as never, source: 'environment' };
    }

    return {
      value: SETTINGS_CODE_DEFAULTS[field] as NonNullable<
        ApplicationSettings[K]
      >,
      source: 'default',
    };
  }

  private assign<K extends SettingsField>(
    resolved: ResolvedSettings,
    field: K,
    setting: ResolvedSetting<NonNullable<ApplicationSettings[K]>>,
  ): void {
    (resolved as Record<SettingsField, unknown>)[field] = setting;
  }
}
