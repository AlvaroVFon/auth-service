import type { ApplicationsPort } from '../applications';
import { OBJECTID_REGEX } from '../common/constants/regex';
import {
  resolveEnvironmentSettings,
  SETTINGS_CODE_DEFAULTS,
} from './settings.defaults';
import type { ApplicationSettings } from './settings.interface';
import type {
  GlobalSettingsPort,
  ResolvedSetting,
  ResolvedSettings,
  SettingsPort,
} from './settings.port';
import {
  SETTINGS_FIELDS,
  type SettingsField,
  validateApplicationSettings,
} from './settings.validation';

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

export class SettingsService implements SettingsPort {
  constructor(
    private readonly applicationsService: ApplicationsPort,
    private readonly globalSettings: GlobalSettingsPort,
  ) {}

  async resolveForApplication(
    applicationId: string,
  ): Promise<ResolvedSettings> {
    const [application, global] = await Promise.all([
      this.findApplication(applicationId),
      this.globalSettings.get(),
    ]);

    return this.resolve(application?.settings, global);
  }

  async resolveGlobal(): Promise<ResolvedSettings> {
    return this.resolve(undefined, await this.globalSettings.get());
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
