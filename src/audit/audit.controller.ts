import { Request, Response } from 'express';

import { Catch } from '../common/decorators/catch.decorator';
import { InvalidArgumentError } from '../common/exceptions/base.exception';
import { AuditEvent, AuditEventRecord } from './audit.interface';
import { AuditEventFilter, AuditPort } from './audit.port';

const parseDate = (value: unknown, name: string): Date | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new InvalidArgumentError(`${name} must be a valid date`);
  }

  return new Date(value);
};

const parseString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export class AuditController {
  constructor(private readonly auditService: AuditPort) {}

  @Catch()
  async list(req: Request, res: Response): Promise<void> {
    const event = parseString(req.query.event);
    const userId = parseString(req.query.userId);
    const email = parseString(req.query.email);
    const applicationId = parseString(req.query.applicationId);
    const from = parseDate(req.query.from, 'from');
    const to = parseDate(req.query.to, 'to');
    const limitParam = parseString(req.query.limit);

    if (
      event !== undefined &&
      !Object.values(AuditEvent).includes(event as AuditEvent)
    ) {
      throw new InvalidArgumentError('Invalid event');
    }

    const filter: AuditEventFilter = {};

    if (userId !== undefined) {
      filter.userId = userId;
    }
    if (email !== undefined) {
      filter.email = email;
    }
    if (applicationId !== undefined) {
      filter.applicationId = applicationId;
    }
    if (event !== undefined) {
      filter.event = event as AuditEvent;
    }
    if (from !== undefined) {
      filter.from = from;
    }
    if (to !== undefined) {
      filter.to = to;
    }
    if (limitParam !== undefined) {
      if (Number.isNaN(Number(limitParam))) {
        throw new InvalidArgumentError('limit must be a number');
      }
      filter.limit = Number(limitParam);
    }

    const events: AuditEventRecord[] = await this.auditService.list(filter);

    res.status(200).json(events);
  }
}
