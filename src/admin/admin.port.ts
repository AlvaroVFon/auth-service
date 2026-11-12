import type { ApplicationCounts } from '../applications';
import type { LoginCount } from '../audit';
import type { InvitationCounts } from '../links';
import type { UserCounts } from '../users';
import type { AdminOverview } from './admin.interface';

/**
 * The aggregate queries the overview needs. Keeping it narrow lets the service
 * compose them without owning any collection and keeps the unit tests free of
 * Mongo.
 */
export interface AdminOverviewSources {
  countUsers(): Promise<UserCounts>;
  countApplications(): Promise<ApplicationCounts>;
  countActiveSessions(): Promise<number>;
  countInvitations(): Promise<InvitationCounts>;
  countLogins(since: Date): Promise<LoginCount>;
}

export interface AdminPort {
  getOverview(): Promise<AdminOverview>;
}
