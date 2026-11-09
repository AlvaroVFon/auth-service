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
  SETTINGS_UPDATED = 'settings.updated',
  USER_UNLOCKED = 'user.unlocked',
  USER_VERIFIED = 'user.verified',
  USER_MFA_RESET = 'user.mfa_reset',
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
  fields?: string[];
  createdAt?: Date;
}
