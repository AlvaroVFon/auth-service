import { Request, Response } from 'express';

import { Catch } from '../common/decorators/catch.decorator';
import { InvalidArgumentError } from '../common/exceptions/base.exception';
import { parseListQuery } from '../common/pagination';
import { auditCsvHeader, auditCsvRow } from './audit-csv';
import { AUDIT_EVENT_DESCRIPTIONS, AuditEvent } from './audit.interface';
import {
  AUDIT_LIST_OPTIONS,
  AuditEventFilter,
  AuditExportFilter,
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
  constructor(
    private readonly auditService: AuditPort,
    private readonly maxExportRows: number = 10_000,
  ) {}

  @Catch()
  async list(req: Request, res: Response): Promise<void> {
    const filter: AuditEventFilter = {
      ...this.parseFilters(req),
      ...parseListQuery<AuditSortField>(
        req.query as Record<string, unknown>,
        AUDIT_LIST_OPTIONS,
      ),
    };

    const events = await this.auditService.list(filter);

    res.status(200).json(events);
  }

  @Catch()
  async catalog(_req: Request, res: Response): Promise<void> {
    const events = Object.values(AuditEvent).map((event) => ({
      event,
      description: AUDIT_EVENT_DESCRIPTIONS[event],
    }));

    res.status(200).json({ events });
  }

  @Catch()
  async exportCsv(req: Request, res: Response): Promise<void> {
    const filter = this.parseFilters(req);
    const total = await this.auditService.countForExport(filter);

    if (total > this.maxExportRows) {
      throw new InvalidArgumentError(
        `Export exceeds ${this.maxExportRows} rows; narrow the date range`,
      );
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="audit-events.csv"',
    );
    res.write(`${auditCsvHeader()}\n`);

    for await (const event of this.auditService.streamForExport(filter)) {
      res.write(`${auditCsvRow(event)}\n`);
    }

    res.end();
  }

  private parseFilters(req: Request): AuditExportFilter {
    const event = parseString(req.query.event);
    const userId = parseString(req.query.userId);
    const email = parseString(req.query.email);
    const applicationId = parseString(req.query.applicationId);
    const from = parseDate(req.query.from, 'from');
    const to = parseDate(req.query.to, 'to', true);
    const q = parseString(req.query.q);
    const filter: AuditExportFilter = {};

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
    if (q !== undefined) {
      filter.q = q;
    }

    return filter;
  }
}
