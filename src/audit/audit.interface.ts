import { Types } from 'mongoose';

export enum AuditEvent {
  LOGIN_SUCCEEDED = 'login.succeeded',
  LOGIN_FAILED = 'login.failed',
  ACCOUNT_LOCKED = 'login.locked',
  TOKEN_REFRESHED = 'token.refreshed',
  LOGGED_OUT = 'session.logged_out',
  SESSION_REVOKED = 'session.revoked',
  SESSIONS_REVOKED = 'session.revoked_all',
  GRANT_ASSIGNED = 'grant.assigned',
  GRANT_REVOKED = 'grant.revoked',
}

export enum AuditResult {
  SUCCESS = 'success',
  FAILURE = 'failure',
}

export interface AuditEventRecord {
  _id: Types.ObjectId;
  event: AuditEvent;
  result: AuditResult;
  userId?: Types.ObjectId;
  email?: string;
  applicationId?: Types.ObjectId;
  audience?: string;
  role?: string;
  actorId?: Types.ObjectId;
  targetUserId?: Types.ObjectId;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: Date;
}
