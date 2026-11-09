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

const escapeCsvValue = (value: string | Date | undefined | null): string => {
  const text =
    value === undefined || value === null
      ? ''
      : value instanceof Date
        ? value.toISOString()
        : String(value);

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
