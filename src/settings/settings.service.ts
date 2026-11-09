import type { ApplicationsPort } from '../applications';
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

    // Capture the versions before the reads: a write that finishes while this
    // resolution is in flight must not be overwritten by the older value.
    const generation = this.writeGeneration;

    const [application, global] = await Promise.all([
      this.findApplication(applicationId),
      this.globalSettings.get(),
    ]);

    const resolved = this.resolve(application?.settings, global);

    // Unknown and malformed ids are not cached: they must not evict real
    // application entries or pin a policy for an id that cannot exist.
    if (application !== null && this.writeGeneration === generation) {
      this.cache.set(key, resolved);
    }

    return resolved;
  }

  async resolveApplicationWithGlobal(
    applicationId: string,
  ): Promise<{ application: ResolvedSettings; global: ResolvedSettings }> {
    const key = applicationCacheKey(applicationId);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return { application: cached, global: await this.resolveGlobal() };
    }

    const generation = this.writeGeneration;
    const [application, global] = await Promise.all([
      this.findApplication(applicationId),
      this.globalSettings.get(),
    ]);
    const applicationResolved = this.resolve(application?.settings, global);
    const globalResolved = this.resolve(undefined, global);

    if (application !== null && this.writeGeneration === generation) {
      this.cache.set(key, applicationResolved);
    }

    return { application: applicationResolved, global: globalResolved };
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
    this.cache.invalidate(applicationCacheKey(applicationId));

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
