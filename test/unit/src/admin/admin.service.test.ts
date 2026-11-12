import type { AdminOverviewSources } from '../../../../src/admin/admin.port';
import { AdminService } from '../../../../src/admin/admin.service';

const FIXED_NOW = new Date('2026-05-10T12:00:00.000Z');

const buildSources = (
  overrides: Partial<AdminOverviewSources> = {},
): AdminOverviewSources => ({
  countUsers: async () => ({
    total: 4,
    verified: 3,
    unverified: 1,
    locked: 1,
  }),
  countApplications: async () => ({ total: 2, active: 1, inactive: 1 }),
  countActiveSessions: async () => 5,
  countInvitations: async () => ({ pending: 2, expired: 1 }),
  countLogins: async () => ({ succeeded: 1, failed: 1 }),
  ...overrides,
});

describe('AdminService.getOverview', () => {
  test('composes every counter block and stamps the calculation date', async () => {
    const service = new AdminService(buildSources(), () => FIXED_NOW);

    const overview = await service.getOverview();

    assert.strictEqual(overview.generatedAt, FIXED_NOW.toISOString());
    assert.deepStrictEqual(overview.users, {
      total: 4,
      verified: 3,
      unverified: 1,
      locked: 1,
    });
    assert.deepStrictEqual(overview.applications, {
      total: 2,
      active: 1,
      inactive: 1,
    });
    assert.deepStrictEqual(overview.sessions, { active: 5 });
    assert.deepStrictEqual(overview.invitations, { pending: 2, expired: 1 });
    assert.deepStrictEqual(overview.logins, {
      last24Hours: { succeeded: 1, failed: 1 },
      last7Days: { succeeded: 1, failed: 1 },
    });
  });

  test('asks for the 24 hour and 7 day windows from the same clock reading', async () => {
    const since: Date[] = [];
    const service = new AdminService(
      buildSources({
        countLogins: async (windowStart) => {
          since.push(windowStart);
          return { succeeded: 0, failed: 0 };
        },
      }),
      () => FIXED_NOW,
    );

    await service.getOverview();

    assert.deepStrictEqual(
      since.map((date) => date.toISOString()),
      [
        new Date(FIXED_NOW.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        new Date(FIXED_NOW.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      ],
    );
  });
});
