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
  INVITATION_REVOKED = 'invitation.revoked',
  INVITATION_RESENT = 'invitation.resent',
  SETTINGS_UPDATED = 'settings.updated',
  USER_UNLOCKED = 'user.unlocked',
  USER_VERIFIED = 'user.verified',
  USER_MFA_RESET = 'user.mfa_reset',
}

export enum AuditResult {
  SUCCESS = 'success',
  FAILURE = 'failure',
}

/** Human-readable catalog exposed to the panel's event selector. */
export const AUDIT_EVENT_DESCRIPTIONS: Readonly<Record<AuditEvent, string>> =
  Object.freeze({
    [AuditEvent.LOGIN_SUCCEEDED]: 'A user signed in successfully.',
    [AuditEvent.LOGIN_FAILED]: 'A sign-in attempt failed.',
    [AuditEvent.ACCOUNT_LOCKED]: 'A sign-in was rejected by an active lockout.',
    [AuditEvent.TOKEN_REFRESHED]: 'A session rotated its refresh token.',
    [AuditEvent.LOGGED_OUT]: 'A user closed a session.',
    [AuditEvent.SESSION_REVOKED]: 'A session was revoked.',
    [AuditEvent.SESSIONS_REVOKED]: 'All sessions were revoked.',
    [AuditEvent.GRANT_ASSIGNED]: 'A grant was assigned.',
    [AuditEvent.GRANT_REVOKED]: 'A grant was revoked.',
    [AuditEvent.APPLICATION_UPDATED]: 'An application was updated.',
    [AuditEvent.APPLICATION_ACTIVATED]: 'An application was activated.',
    [AuditEvent.APPLICATION_DEACTIVATED]: 'An application was deactivated.',
    [AuditEvent.APPLICATION_ARCHIVED]: 'An application was archived.',
    [AuditEvent.MEMBER_GRANTED]: 'A member was granted access.',
    [AuditEvent.INVITATION_REVOKED]: 'An invitation was revoked.',
    [AuditEvent.INVITATION_RESENT]: 'An invitation was resent.',
    [AuditEvent.SETTINGS_UPDATED]: 'Policy settings were updated.',
    [AuditEvent.USER_UNLOCKED]: 'An owner cleared an account lockout.',
    [AuditEvent.USER_VERIFIED]: 'An owner marked an account as verified.',
    [AuditEvent.USER_MFA_RESET]: 'An owner reset the MFA of an account.',
  });

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
