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
  APPLICATION_UPDATED = 'application.updated',
  APPLICATION_ACTIVATED = 'application.activated',
  APPLICATION_DEACTIVATED = 'application.deactivated',
  APPLICATION_ARCHIVED = 'application.archived',
  MEMBER_GRANTED = 'member.granted',
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
  sessionId?: string;
  applicationId?: Types.ObjectId;
  audience?: string;
  role?: string;
  actorId?: Types.ObjectId;
  targetUserId?: Types.ObjectId;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: Date;
}
