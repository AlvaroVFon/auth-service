import type { AdminOverview } from './admin.interface';
import type { AdminOverviewSources, AdminPort } from './admin.port';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export class AdminService implements AdminPort {
  constructor(
    private readonly sources: AdminOverviewSources,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getOverview(): Promise<AdminOverview> {
    // One clock reading keeps every window and `generatedAt` consistent.
    const generatedAt = this.now();
    const since24Hours = new Date(generatedAt.getTime() - DAY_MS);
    const since7Days = new Date(generatedAt.getTime() - WEEK_MS);

    const [users, applications, sessions, invitations, last24Hours, last7Days] =
      await Promise.all([
        this.sources.countUsers(),
        this.sources.countApplications(),
        this.sources.countActiveSessions(),
        this.sources.countInvitations(),
        this.sources.countLogins(since24Hours),
        this.sources.countLogins(since7Days),
      ]);

    return {
      generatedAt: generatedAt.toISOString(),
      users,
      applications,
      sessions: { active: sessions },
      logins: { last24Hours, last7Days },
      invitations,
    };
  }
}
