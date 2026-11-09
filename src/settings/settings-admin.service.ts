import { AuditEvent, AuditPort, AuditResult } from '../audit';
import { SETTINGS_CODE_DEFAULTS } from './settings.defaults';
import type { ApplicationSettings } from './settings.interface';
import type {
  ResolvedSettings,
  SettingSource,
  SettingsPort,
} from './settings.port';
import { SETTINGS_FIELDS, type SettingsField } from './settings.validation';

export interface GlobalSettingsView {
  settings: Record<SettingsField, unknown>;
  sources: Record<SettingsField, SettingSource>;
  defaults: Readonly<Required<ApplicationSettings>>;
}

/** Effective policy of one application plus the global layer it inherits from. */
export interface ApplicationSettingsView {
  settings: Record<SettingsField, unknown>;
  sources: Record<SettingsField, SettingSource>;
  global: GlobalSettingsView;
}

export class SettingsAdminService {
  constructor(
    private readonly settingsService: SettingsPort,
    private readonly auditService?: AuditPort,
  ) {}

  async getGlobal(): Promise<GlobalSettingsView> {
    return this.toView(await this.settingsService.resolveGlobal());
  }

  /**
   * Reads the effective policy of an application and the global layer used as
   * its reference. The route guard has already resolved the active application,
   * so an invalid id never reaches this method.
   */
  async getApplication(
    applicationId: string,
  ): Promise<ApplicationSettingsView> {
    const [resolved, global] = await Promise.all([
      this.settingsService.resolveForApplication(applicationId),
      this.settingsService.resolveGlobal(),
    ]);
    const view = this.toView(resolved);

    return {
      settings: view.settings,
      sources: view.sources,
      global: this.toView(global),
    };
  }

  async updateGlobal(
    patch: Record<string, unknown>,
    actorId?: string,
  ): Promise<GlobalSettingsView> {
    const before = await this.settingsService.resolveGlobal();
    const resolved = await this.settingsService.updateGlobalSettings(patch);
    // A repeated value is a no-op; only real transitions are audited.
    const fields = SETTINGS_FIELDS.filter(
      (field) =>
        before[field].value !== resolved[field].value ||
        before[field].source !== resolved[field].source,
    );

    if (fields.length > 0 && this.auditService) {
      await this.auditService.record({
        event: AuditEvent.SETTINGS_UPDATED,
        result: AuditResult.SUCCESS,
        ...(actorId === undefined ? {} : { actorId }),
        fields,
      });
    }

    return this.toView(resolved);
  }

  private toView(resolved: ResolvedSettings): GlobalSettingsView {
    const settings = {} as Record<SettingsField, unknown>;
    const sources = {} as Record<SettingsField, SettingSource>;

    for (const field of SETTINGS_FIELDS) {
      settings[field] = resolved[field].value;
      sources[field] = resolved[field].source;
    }

    return { settings, sources, defaults: SETTINGS_CODE_DEFAULTS };
  }
}
