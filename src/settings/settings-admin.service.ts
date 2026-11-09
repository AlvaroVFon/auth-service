import type { ApplicationsPort } from '../applications';
import { AuditEvent, AuditPort, AuditResult } from '../audit';
import { EntityNotFoundError } from '../common/exceptions/base.exception';
import { SETTINGS_CODE_DEFAULTS } from './settings.defaults';
import type {
  ApplicationSettings,
  ApplicationSettingsPatch,
} from './settings.interface';
import type {
  ResolvedSettings,
  SettingSource,
  SettingsPort,
} from './settings.port';
import { SETTINGS_FIELDS, type SettingsField } from './settings.validation';

export interface SettingsView {
  settings: Record<SettingsField, unknown>;
  sources: Record<SettingsField, SettingSource>;
  defaults: Readonly<Required<ApplicationSettings>>;
}

/** Kept for callers that only deal with the global scope. */
export type GlobalSettingsView = SettingsView;

/** Effective policy of one application plus the global layer it inherits from. */
export interface ApplicationSettingsView {
  settings: Record<SettingsField, unknown>;
  sources: Record<SettingsField, SettingSource>;
  global: GlobalSettingsView;
}

export class SettingsAdminService {
  constructor(
    private readonly settingsService: SettingsPort,
    private readonly auditService: AuditPort | undefined,
    private readonly applicationsService: ApplicationsPort,
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
    const resolved =
      await this.settingsService.resolveApplicationWithGlobal(applicationId);
    const view = this.toView(resolved.application);

    return {
      settings: view.settings,
      sources: view.sources,
      global: this.toView(resolved.global),
    };
  }

  async updateGlobal(
    patch: Record<string, unknown>,
    actorId?: string,
  ): Promise<GlobalSettingsView> {
    const before = await this.settingsService.resolveGlobal();
    const resolved = await this.settingsService.updateGlobalSettings(patch);
    // A repeated value is a no-op; only real transitions are audited.
    const fields = this.changedFields(before, resolved);

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

  /**
   * Writes the overrides of one active application: null removes an override,
   * absent fields are untouched, and only real value/source transitions are
   * audited. Validation happens inside the settings port before it writes or
   * invalidates the cache.
   */
  async updateApplication(
    applicationId: string,
    patch: ApplicationSettingsPatch,
    actorId?: string,
  ): Promise<SettingsView> {
    const application =
      await this.applicationsService.findAssignableById(applicationId);

    if (!application) {
      throw new EntityNotFoundError('Application not found');
    }

    const before =
      await this.settingsService.resolveForApplication(applicationId);
    const resolved = await this.settingsService.updateApplicationSettings(
      applicationId,
      patch,
    );
    const fields = this.changedFields(before, resolved);

    if (fields.length > 0 && this.auditService) {
      await this.auditService.record({
        event: AuditEvent.SETTINGS_UPDATED,
        result: AuditResult.SUCCESS,
        ...(actorId === undefined ? {} : { actorId }),
        applicationId,
        fields,
      });
    }

    return this.toView(resolved);
  }

  /** Fields whose effective value or provenance changed. */
  private changedFields(
    before: ResolvedSettings,
    resolved: ResolvedSettings,
  ): SettingsField[] {
    return SETTINGS_FIELDS.filter(
      (field) =>
        before[field].value !== resolved[field].value ||
        before[field].source !== resolved[field].source,
    );
  }

  private toView(resolved: ResolvedSettings): SettingsView {
    const settings = {} as Record<SettingsField, unknown>;
    const sources = {} as Record<SettingsField, SettingSource>;

    for (const field of SETTINGS_FIELDS) {
      settings[field] = resolved[field].value;
      sources[field] = resolved[field].source;
    }

    return { settings, sources, defaults: SETTINGS_CODE_DEFAULTS };
  }
}
