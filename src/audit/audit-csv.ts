import type { AuditEventRecord } from './audit.interface';

/** Stable column order of the export; never add request headers or tokens. */
export const AUDIT_CSV_COLUMNS = [
  'createdAt',
  'event',
  'result',
  'actorId',
  'targetUserId',
  'applicationId',
  'audience',
] as const;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

const escapeCsvValue = (value: string | Date | undefined | null): string => {
  const raw =
    value === undefined || value === null
      ? ''
      : value instanceof Date
        ? value.toISOString()
        : String(value);
  // Neutralize spreadsheet formula injection before CSV quoting. Audit values
  // such as the login `audience` are attacker-controlled.
  const text = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;

  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const auditCsvHeader = (): string => AUDIT_CSV_COLUMNS.join(',');

export const auditCsvRow = (event: AuditEventRecord): string =>
  [
    event.createdAt,
    event.event,
    event.result,
    event.actorId?.toString(),
    event.targetUserId?.toString(),
    event.applicationId?.toString(),
    event.audience,
  ]
    .map(escapeCsvValue)
    .join(',');
