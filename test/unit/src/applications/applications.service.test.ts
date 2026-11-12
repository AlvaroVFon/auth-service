import { Model } from 'mongoose';

import { Application } from '../../../../src/applications/applications.interface';
import { ApplicationsService } from '../../../../src/applications/applications.service';

describe('ApplicationsService.countApplications', () => {
  test('should group by active and derive the inactive total', async () => {
    const aggregate = mock.fn(async () => [{ total: 4, active: 3 }]);
    const service = new ApplicationsService({
      aggregate,
    } as unknown as Model<Application>);

    assert.deepStrictEqual(await service.countApplications(), {
      total: 4,
      active: 3,
      inactive: 1,
    });

    const pipeline = aggregate.mock.calls[0]?.arguments[0] as Array<{
      $group: { total: unknown; active: unknown };
    }>;
    assert.deepStrictEqual(pipeline[0]!.$group.total, { $sum: 1 });
    assert.deepStrictEqual(pipeline[0]!.$group.active, {
      $sum: { $cond: ['$active', 1, 0] },
    });
  });

  test('should return zeros when the catalog is empty', async () => {
    const service = new ApplicationsService({
      aggregate: async () => [],
    } as unknown as Model<Application>);

    assert.deepStrictEqual(await service.countApplications(), {
      total: 0,
      active: 0,
      inactive: 0,
    });
  });
});
