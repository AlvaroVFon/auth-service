import { Model, Types } from 'mongoose';

import { normalizeEmail } from '../common/email';
import { InvalidArgumentError } from '../common/exceptions/base.exception';
import {
  buildPaginatedResult,
  buildSearchRegex,
  buildSortObject,
  type PaginatedResult,
} from '../common/pagination';
import { assertObjectId } from '../common/validators/object-id';
import { LoggerInterface } from '../libs/logger';
import { AuditEvent, AuditEventRecord } from './audit.interface';
import {
  AuditEventFilter,
  AuditPort,
  RecordAuditEventInput,
} from './audit.port';

export class AuditService implements AuditPort {
  constructor(
    private readonly auditModel: Model<AuditEventRecord>,
    private readonly logger: LoggerInterface,
  ) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    try {
      await this.auditModel.create({
        event: input.event,
        result: input.result,
        ...(input.userId === undefined
          ? {}
          : { userId: new Types.ObjectId(input.userId) }),
        ...(input.email === undefined
          ? {}
          : { email: normalizeEmail(input.email) }),
        ...(input.sessionId === undefined
          ? {}
          : { sessionId: input.sessionId }),
        ...(input.applicationId === undefined
          ? {}
          : { applicationId: new Types.ObjectId(input.applicationId) }),
        ...(input.audience === undefined ? {} : { audience: input.audience }),
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(input.actorId === undefined
          ? {}
          : { actorId: new Types.ObjectId(input.actorId) }),
        ...(input.targetUserId === undefined
          ? {}
          : { targetUserId: new Types.ObjectId(input.targetUserId) }),
        ...(input.ipAddress === undefined
          ? {}
          : { ipAddress: input.ipAddress }),
        ...(input.userAgent === undefined
          ? {}
          : { userAgent: input.userAgent }),
        ...(input.fields === undefined ? {} : { fields: input.fields }),
      });
    } catch (error) {
      // Auditing is best effort: a write failure must never break the auth flow.
      this.logger.warn(`Failed to record audit event ${input.event}`, error);
    }
  }

  /**
   * Offset pagination over an append-only log. The order is stable for a given
   * snapshot; an event written or pruned between two page requests can shift
   * the window, so a de-duplicated walk is only guaranteed on a static view.
   */
  async list(
    filter: AuditEventFilter,
  ): Promise<PaginatedResult<AuditEventRecord>> {
    const query: Record<string, unknown> = {};

    if (filter.userId !== undefined) {
      assertObjectId(filter.userId, 'userId');
      query.userId = new Types.ObjectId(filter.userId);
    }
    if (filter.applicationId !== undefined) {
      assertObjectId(filter.applicationId, 'applicationId');
      query.applicationId = new Types.ObjectId(filter.applicationId);
    }
    if (filter.email !== undefined) {
      query.email = normalizeEmail(filter.email);
    }
    if (filter.event !== undefined) {
      if (!Object.values(AuditEvent).includes(filter.event as AuditEvent)) {
        throw new InvalidArgumentError('Invalid event');
      }
      query.event = filter.event;
    }
    if (filter.from !== undefined || filter.to !== undefined) {
      const range: Record<string, Date> = {};
      if (filter.from !== undefined) {
        range.$gte = filter.from;
      }
      if (filter.to !== undefined) {
        range.$lte = filter.to;
      }
      if (
        filter.from !== undefined &&
        filter.to !== undefined &&
        filter.from > filter.to
      ) {
        throw new InvalidArgumentError('from must be before to');
      }
      query.createdAt = range;
    }

    if (filter.q !== undefined) {
      query.$or = [
        { email: buildSearchRegex(filter.q) },
        { event: buildSearchRegex(filter.q) },
        { audience: buildSearchRegex(filter.q) },
      ];
    }

    const [items, total] = await Promise.all([
      this.auditModel
        .find(query)
        .sort(buildSortObject(filter.sort))
        .skip((filter.page - 1) * filter.limit)
        .limit(filter.limit)
        // The audit collection is the highest-volume one; a sort over a field
        // without a matching `_id` tie-break index must not fail at 32 MB.
        .allowDiskUse(true),
      this.auditModel.countDocuments(query),
    ]);

    return buildPaginatedResult(items, total, filter);
  }
}
