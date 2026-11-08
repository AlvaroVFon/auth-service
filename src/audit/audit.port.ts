import type {
  ListQuery,
  ListQueryOptions,
  PaginatedResult,
} from '../common/pagination';
import { AuditEvent, AuditEventRecord, AuditResult } from './audit.interface';

export interface RecordAuditEventInput {
  event: AuditEvent;
  result: AuditResult;
  userId?: string;
  email?: string;
  sessionId?: string;
  applicationId?: string;
  audience?: string;
  role?: string;
  actorId?: string;
  targetUserId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Fields the owner may order the audit history by. */
export const AUDIT_SORTABLE_FIELDS = [
  'createdAt',
  'event',
  'email',
  'audience',
  'result',
] as const;

export type AuditSortField = (typeof AUDIT_SORTABLE_FIELDS)[number];

/** Default query contract of `GET /audit-events`. */
export const AUDIT_LIST_OPTIONS: ListQueryOptions<AuditSortField> = {
  sortableFields: AUDIT_SORTABLE_FIELDS,
  defaultSort: { field: 'createdAt', direction: -1 },
};

/**
 * Exact filters plus the shared listing pagination. `q` searches by prefix on
 * `email`, `event` and `audience`; `event` keeps its exact enum semantics.
 */
export interface AuditEventFilter extends ListQuery<AuditSortField> {
  userId?: string;
  email?: string;
  applicationId?: string;
  event?: string;
  from?: Date;
  to?: Date;
}

export interface AuditPort {
  record(input: RecordAuditEventInput): Promise<void>;
  list(filter: AuditEventFilter): Promise<PaginatedResult<AuditEventRecord>>;
}
