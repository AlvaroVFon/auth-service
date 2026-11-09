import { Model } from 'mongoose';

import { LinkType, OneTimeLink } from '../../../../src/links/link.interface';
import { LinksService } from '../../../../src/links/links.service';

describe('LinksService.countInvitations', () => {
  test('should split unused invitations by expiry and default missing buckets to zero', async () => {
    const aggregate = mock.fn(async () => [
      { _id: 'pending', count: 2 },
      { _id: 'expired', count: 1 },
    ]);
    const service = new LinksService({
      aggregate,
    } as unknown as Model<OneTimeLink>);

    assert.deepStrictEqual(await service.countInvitations(), {
      pending: 2,
      expired: 1,
    });

    const pipeline = aggregate.mock.calls[0]?.arguments[0] as Array<{
      $match: Record<string, unknown>;
      $group: { _id: unknown };
    }>;
    const match = pipeline[0]!.$match as {
      type: LinkType;
      usedAt: null;
      $or: Array<Record<string, unknown>>;
    };
    assert.strictEqual(match.type, LinkType.INVITATION);
    assert.strictEqual(match.usedAt, null);
    assert.strictEqual(match.$or.length, 2);
    assert.deepStrictEqual(match.$or[0], {
      expiresAt: { $lte: (match.$or[0]!.expiresAt as { $lte: Date }).$lte },
    });
    assert.deepStrictEqual(match.$or[1], {
      invalidatedAt: null,
      expiresAt: { $gt: (match.$or[1]!.expiresAt as { $gt: Date }).$gt },
    });
    assert.ok((match.$or[0]!.expiresAt as { $lte: Date }).$lte instanceof Date);
    assert.ok((match.$or[1]!.expiresAt as { $gt: Date }).$gt instanceof Date);
    const cond = pipeline[1]!.$group._id as {
      $cond: [{ $gt: [string, Date] }, string, string];
    };
    assert.strictEqual(cond.$cond[0].$gt[0], '$expiresAt');
    assert.ok(cond.$cond[0].$gt[1] instanceof Date);
    assert.strictEqual(cond.$cond[1], 'pending');
    assert.strictEqual(cond.$cond[2], 'expired');
  });

  test('should return zeros when there are no invitations', async () => {
    const service = new LinksService({
      aggregate: async () => [],
    } as unknown as Model<OneTimeLink>);

    assert.deepStrictEqual(await service.countInvitations(), {
      pending: 0,
      expired: 0,
    });
  });
});
