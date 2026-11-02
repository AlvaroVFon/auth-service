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

export interface AuditEventFilter {
  userId?: string;
  email?: string;
  applicationId?: string;
  event?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface AuditPort {
  record(input: RecordAuditEventInput): Promise<void>;
  list(filter?: AuditEventFilter): Promise<AuditEventRecord[]>;
}
