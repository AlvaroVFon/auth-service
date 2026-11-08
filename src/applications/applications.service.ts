import { Model } from 'mongoose';

import { AuditEvent, AuditPort, AuditResult } from '../audit';
import { SLUG_REGEX } from '../common/constants/regex';
import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import {
  DuplicateKeyError,
  duplicateKeyFields,
  isDuplicateKeyError,
} from '../common/mongo/duplicate-key';
import {
  buildPaginatedResult,
  buildSearchRegex,
  buildSortObject,
  type ListQuery,
  type PaginatedResult,
} from '../common/pagination';
import { assertObjectId } from '../common/validators/object-id';
import type { SettingsChanges } from '../settings';
import { Application } from './applications.interface';
import {
  type ApplicationSortField,
  ApplicationsPort,
  CreateApplicationInput,
  UpdateApplicationInput,
} from './applications.port';

const MUTABLE_APPLICATION_FIELDS = ['name', 'active'] as const;

export class ApplicationsService implements ApplicationsPort {
  constructor(
    private readonly applicationModel: Model<Application>,
    private readonly auditService?: AuditPort,
  ) {}

  async create(input: CreateApplicationInput): Promise<Application> {
    const name = input.name?.trim();
    const slug = input.slug?.trim().toLowerCase();
    const audience = input.audience?.trim();

    if (!name) {
      throw new InvalidArgumentError('Name is required');
    }
    if (!slug) {
      throw new InvalidArgumentError('Slug is required');
    }
    if (!SLUG_REGEX.test(slug)) {
      throw new InvalidArgumentError('Slug format is invalid');
    }
    if (!audience) {
      throw new InvalidArgumentError('Audience is required');
    }

    try {
      return await this.applicationModel.create({
        name,
        slug,
        audience,
        active: true,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new EntityAlreadyExistsError(
          this.duplicateApplicationMessage(error),
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    input: UpdateApplicationInput,
    actorId?: string,
  ): Promise<Application> {
    assertObjectId(id);

    const payload = input ?? {};
    const fields = Object.keys(payload).filter(
      (field) => (payload as Record<string, unknown>)[field] !== undefined,
    );

    if (fields.length === 0) {
      throw new InvalidArgumentError('Name or active is required');
    }

    const immutable = fields.find(
      (field) =>
        !MUTABLE_APPLICATION_FIELDS.includes(
          field as (typeof MUTABLE_APPLICATION_FIELDS)[number],
        ),
    );
    if (immutable !== undefined) {
      throw new InvalidArgumentError('Only name and active can be updated');
    }

    const update: Partial<Pick<Application, 'name' | 'active'>> = {};

    if (fields.includes('name')) {
      if (typeof payload.name !== 'string') {
        throw new InvalidArgumentError('Name must be a string');
      }

      const name = payload.name.trim();
      if (!name) {
        throw new InvalidArgumentError('Name is required');
      }
      update.name = name;
    }

    if (fields.includes('active')) {
      if (typeof payload.active !== 'boolean') {
        throw new InvalidArgumentError('Active must be a boolean');
      }
      update.active = payload.active;
    }

    // One conditional write: the filter only matches when at least one value
    // really changes, so two concurrent requests cannot audit the same
    // transition and a repeated payload is a no-op.
    const before = await this.applicationModel.findOneAndUpdate(
      {
        _id: id,
        $or: Object.entries(update).map(([field, value]) => ({
          [field]: { $ne: value },
        })),
      },
      { $set: update },
      { returnDocument: 'before' },
    );

    if (!before) {
      const existing = await this.applicationModel.findById(id);

      if (!existing) {
        throw new EntityNotFoundError('Application not found');
      }

      // Nothing changed: there is no transition to audit.
      return existing;
    }

    const events: AuditEvent[] = [];

    if (update.name !== undefined && update.name !== before.name) {
      events.push(AuditEvent.APPLICATION_UPDATED);
    }

    if (update.active !== undefined && update.active !== before.active) {
      events.push(
        update.active
          ? AuditEvent.APPLICATION_ACTIVATED
          : AuditEvent.APPLICATION_DEACTIVATED,
      );
    }

    for (const event of events) {
      await this.recordApplicationEvent(event, id, actorId);
    }

    // The pre-image plus the applied changes is the post-image without a second
    // round-trip that could race with another writer.
    return { ...before.toObject(), ...update } as Application;
  }

  /**
   * Archives the application: it is never deleted, so its grants and its audit
   * trail survive and the owner keeps administering them. Repeating the call is
   * an idempotent no-op: only the real transition is audited.
   */
  async archive(id: string, actorId?: string): Promise<Application> {
    assertObjectId(id);

    // One conditional write covers all three cases: `null` is the 404, a
    // pre-image with `active: true` is the real transition and a pre-image with
    // `active: false` is the idempotent repeat.
    const before = await this.applicationModel.findOneAndUpdate(
      { _id: id },
      { $set: { active: false } },
      { returnDocument: 'before' },
    );

    if (!before) {
      throw new EntityNotFoundError('Application not found');
    }

    if (before.active) {
      await this.recordApplicationEvent(
        AuditEvent.APPLICATION_ARCHIVED,
        id,
        actorId,
      );
    }

    return { ...before.toObject(), active: false } as Application;
  }

  async findById(id: string): Promise<Application | null> {
    assertObjectId(id);

    return this.applicationModel.findById(id);
  }

  async findBySlug(slug: string): Promise<Application | null> {
    if (!slug) {
      throw new InvalidArgumentError('Slug is required');
    }

    return this.applicationModel.findOne({ slug: slug.trim().toLowerCase() });
  }

  async findByAudience(audience: string): Promise<Application | null> {
    if (!audience || !audience.trim()) {
      throw new InvalidArgumentError('Audience is required');
    }

    return this.applicationModel.findOne({ audience: audience.trim() });
  }

  async findBySlugOrAudience(identifier: string): Promise<Application | null> {
    if (!identifier || !identifier.trim()) {
      throw new InvalidArgumentError('Application identifier is required');
    }

    const value = identifier.trim();

    // Slug wins when it collides with another application's audience.
    const bySlug = await this.applicationModel.findOne({
      slug: value.toLowerCase(),
    });

    return bySlug ?? (await this.findByAudience(value));
  }

  async findAll(
    query: ListQuery<ApplicationSortField>,
  ): Promise<PaginatedResult<Application>> {
    const filter = query.q
      ? {
          $or: [
            { name: buildSearchRegex(query.q) },
            { slug: buildSearchRegex(query.q) },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.applicationModel
        .find(filter)
        .sort(buildSortObject(query.sort))
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      this.applicationModel.countDocuments(filter),
    ]);

    return buildPaginatedResult(items, total, query);
  }

  async findAllForContext(): Promise<Application[]> {
    // This order belongs to the panel context, not to the catalog endpoint.
    return this.applicationModel.find().sort({ name: 1, slug: 1, _id: 1 });
  }

  async findActiveByIds(ids: string[]): Promise<Application[]> {
    if (ids.length === 0) {
      return [];
    }

    for (const id of ids) {
      assertObjectId(id);
    }

    return this.applicationModel.find({
      _id: { $in: ids },
      active: true,
    });
  }

  /** Applies validated settings changes to the application subdocument. */
  async updateSettings(id: string, changes: SettingsChanges): Promise<void> {
    assertObjectId(id);

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};

    for (const [field, value] of Object.entries(changes.set)) {
      $set[`settings.${field}`] = value;
    }
    for (const field of changes.unset) {
      $unset[`settings.${field}`] = 1;
    }

    if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
      // An empty patch is a no-op, but it must still distinguish a missing
      // application from an existing one so the HTTP layer can answer 404.
      const exists = await this.applicationModel.exists({ _id: id });
      if (!exists) {
        throw new EntityNotFoundError('Application not found');
      }
      return;
    }

    const updated = await this.applicationModel.findByIdAndUpdate(
      id,
      {
        ...(Object.keys($set).length === 0 ? {} : { $set }),
        ...(Object.keys($unset).length === 0 ? {} : { $unset }),
      },
      { returnDocument: 'after' },
    );

    if (!updated) {
      throw new EntityNotFoundError('Application not found');
    }
  }

  async findAssignableById(id: string): Promise<Application | null> {
    const application = await this.findById(id);

    return application?.active ? application : null;
  }

  private async recordApplicationEvent(
    event: AuditEvent,
    applicationId: string,
    actorId?: string,
  ): Promise<void> {
    if (!this.auditService) {
      return;
    }

    await this.auditService.record({
      event,
      result: AuditResult.SUCCESS,
      applicationId,
      ...(actorId === undefined ? {} : { actorId }),
    });
  }

  private duplicateApplicationMessage(error: DuplicateKeyError): string {
    const fields = duplicateKeyFields(error);
    if (fields.includes('slug')) {
      return 'Application slug already exists';
    }
    if (fields.includes('audience')) {
      return 'Application audience already exists';
    }

    return 'Application already exists';
  }
}
