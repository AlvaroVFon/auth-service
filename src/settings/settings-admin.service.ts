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

export class SettingsAdminService {
  constructor(
    private readonly settingsService: SettingsPort,
    private readonly auditService?: AuditPort,
  ) {}

  async getGlobal(): Promise<GlobalSettingsView> {
    return this.toView(await this.settingsService.resolveGlobal());
  }

  async updateGlobal(
    patch: Record<string, unknown>,
    actorId?: string,
  ): Promise<GlobalSettingsView> {
    const fields = Object.keys(patch ?? {});
    const resolved = await this.settingsService.updateGlobalSettings(patch);

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
