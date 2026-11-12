import type { ApplicationCounts } from '../applications';
import type { LoginCount } from '../audit';
import type { InvitationCounts } from '../links';
import type { UserCounts } from '../users';

/** Concurrent sessions that are still valid across every application. */
export interface SessionCounts {
  active: number;
}

/** Successful and failed logins inside one rolling window. */
export interface LoginWindows {
  last24Hours: LoginCount;
  last7Days: LoginCount;
}

/** Aggregated dashboard counters; every value is computed at request time. */
export interface AdminOverview {
  generatedAt: string;
  users: UserCounts;
  applications: ApplicationCounts;
  sessions: SessionCounts;
  logins: LoginWindows;
  invitations: InvitationCounts;
}
