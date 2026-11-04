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
import { assertObjectId } from '../common/validators/object-id';
import { Application } from './applications.interface';
import {
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

    // Audit only real transitions: each field is written with a conditional
    // update so two concurrent requests cannot both report the same transition.
    const changes: Array<{
      field: 'name' | 'active';
      value: string | boolean;
      event: AuditEvent;
    }> = [];

    if (fields.includes('name')) {
      if (typeof payload.name !== 'string') {
        throw new InvalidArgumentError('Name must be a string');
      }

      const name = payload.name.trim();
      if (!name) {
        throw new InvalidArgumentError('Name is required');
      }
      changes.push({
        field: 'name',
        value: name,
        event: AuditEvent.APPLICATION_UPDATED,
      });
    }

    if (fields.includes('active')) {
      if (typeof payload.active !== 'boolean') {
        throw new InvalidArgumentError('Active must be a boolean');
      }
      changes.push({
        field: 'active',
        value: payload.active,
        event: payload.active
          ? AuditEvent.APPLICATION_ACTIVATED
          : AuditEvent.APPLICATION_DEACTIVATED,
      });
    }

    const events: AuditEvent[] = [];

    for (const change of changes) {
      const result = await this.applicationModel.updateOne(
        { _id: id, [change.field]: { $ne: change.value } },
        { $set: { [change.field]: change.value } },
      );

      // `matchedCount` is 0 when the value was already stored (no transition)
      // or the document does not exist; the read below tells them apart.
      if (result.matchedCount > 0) {
        events.push(change.event);
      }
    }

    // The slug and the audience identify the application for every issued
    // token: they are never part of the update, even when sent by mistake.
    const application = await this.applicationModel.findById(id);

    if (!application) {
      throw new EntityNotFoundError('Application not found');
    }

    for (const event of events) {
      await this.recordApplicationEvent(event, id, actorId);
    }

    return application;
  }

  /**
   * Archives the application: it is never deleted, so its grants and its audit
   * trail survive and the owner keeps administering them. Repeating the call is
   * an idempotent no-op: only the real transition is audited.
   */
  async archive(id: string, actorId?: string): Promise<Application> {
    assertObjectId(id);

    // Conditional write: only the request that really flips `active` audits the
    // transition, so concurrent DELETEs cannot duplicate the event.
    const archived = await this.applicationModel.findOneAndUpdate(
      { _id: id, active: true },
      { $set: { active: false } },
      { returnDocument: 'after' },
    );

    if (archived) {
      await this.recordApplicationEvent(
        AuditEvent.APPLICATION_ARCHIVED,
        id,
        actorId,
      );
      return archived;
    }

    const existing = await this.applicationModel.findById(id);
    if (!existing) {
      throw new EntityNotFoundError('Application not found');
    }

    // Already archived: idempotent 200 without a duplicate audit event.
    return existing;
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

  async findAll(): Promise<Application[]> {
    // This order belongs to the catalog endpoint; consumers that build their own
    // view (the panel context) must order their response themselves.
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
