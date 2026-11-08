import { Request, Response } from 'express';

import { Catch } from '../common/decorators/catch.decorator';
import { InvalidArgumentError } from '../common/exceptions/base.exception';
import { parseListQuery } from '../common/pagination';
import {
  AUDIT_LIST_OPTIONS,
  AuditEventFilter,
  AuditPort,
  type AuditSortField,
} from './audit.port';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const parseDate = (
  value: unknown,
  name: string,
  endOfDay = false,
): Date | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new InvalidArgumentError(`${name} must be a valid date`);
  }

  const parsed = new Date(value);

  // A date-only `to` is inclusive: cover the whole day instead of stopping at
  // 00:00:00Z and excluding every event of that day.
  if (endOfDay && DATE_ONLY_REGEX.test(value)) {
    parsed.setUTCHours(23, 59, 59, 999);
  }

  return parsed;
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
    const to = parseDate(req.query.to, 'to', true);

    const filter: AuditEventFilter = {
      ...parseListQuery<AuditSortField>(
        req.query as Record<string, unknown>,
        AUDIT_LIST_OPTIONS,
      ),
    };

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
      filter.event = event;
    }
    if (from !== undefined) {
      filter.from = from;
    }
    if (to !== undefined) {
      filter.to = to;
    }

    const events = await this.auditService.list(filter);

    res.status(200).json(events);
  }
}
