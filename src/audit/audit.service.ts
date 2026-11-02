import { Model, Types } from 'mongoose';

import { normalizeEmail } from '../common/email';
import { InvalidArgumentError } from '../common/exceptions/base.exception';
import { assertObjectId } from '../common/validators/object-id';
import { LoggerInterface } from '../libs/logger';
import { AuditEvent, AuditEventRecord } from './audit.interface';
import {
  AuditEventFilter,
  AuditPort,
  RecordAuditEventInput,
} from './audit.port';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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
      });
    } catch (error) {
      // Auditing is best effort: a write failure must never break the auth flow.
      this.logger.warn(`Failed to record audit event ${input.event}`, error);
    }
  }

  async list(filter: AuditEventFilter = {}): Promise<AuditEventRecord[]> {
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
      if (!Object.values(AuditEvent).includes(filter.event)) {
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

    const limit = Math.min(
      Math.max(filter.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    return this.auditModel.find(query).sort({ createdAt: -1 }).limit(limit);
  }
}
