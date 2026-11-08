import { Model, Types } from 'mongoose';

import type { RefreshToken } from '../../../../../src/auth/tokens/refresh-token.interface';
import { RefreshTokenService } from '../../../../../src/auth/tokens/refresh-token.service';

const token = (index: number) => ({
  _id: new Types.ObjectId(),
  userId: new Types.ObjectId(),
  sessionId: `session-${index}`,
  jti: `jti-${index}`,
});

interface ModelCalls {
  limits: number[];
  filters: unknown[];
}

const buildModel = (
  batchSizes: number[],
  calls: ModelCalls,
): Model<RefreshToken> => {
  let call = 0;
  const find = () => ({
    select: () => ({
      limit: (limit: number) => {
        calls.limits.push(limit);
        return {
          lean: async () => {
            const size = batchSizes[Math.min(call, batchSizes.length - 1)] ?? 0;
            call += 1;
            return Array.from({ length: size }, (_, index) => token(index));
          },
        };
      },
    }),
  });
  const updateMany = async (filter: unknown) => {
    calls.filters.push(filter);

    return { modifiedCount: 0 };
  };

  return { find, updateMany } as unknown as Model<RefreshToken>;
};

const newCalls = (): ModelCalls => ({ limits: [], filters: [] });

describe('RefreshTokenService.revokeAllByAudience completion', () => {
  test('reports an incomplete revocation when every pass is a full batch', async () => {
    const calls = newCalls();
    const service = new RefreshTokenService(
      buildModel([500, 500, 500, 500, 500], calls),
    );

    const result = await service.revokeAllByAudience('app-aud');

    assert.strictEqual(result.complete, false);
    assert.strictEqual(result.sessions.length, 2_500);
    assert.deepStrictEqual(calls.limits, [500, 500, 500, 500, 500]);
    assert.strictEqual(calls.filters.length, 5);
    for (const filter of calls.filters) {
      const parsed = filter as {
        _id: { $in: unknown[] };
        revokedAt: null;
      };
      assert.strictEqual(parsed._id.$in.length, 500);
      // A concurrently revoked token must not be overwritten.
      assert.strictEqual(parsed.revokedAt, null);
    }
  });

  test('reports completion when the last pass is below the batch size', async () => {
    const calls = newCalls();
    const service = new RefreshTokenService(buildModel([2, 0], calls));

    const result = await service.revokeAllByAudience('app-aud');

    assert.strictEqual(result.complete, true);
    assert.strictEqual(result.sessions.length, 2);
    assert.deepStrictEqual(calls.limits, [500, 500]);
    assert.strictEqual(calls.filters.length, 1);
    assert.strictEqual(
      (calls.filters[0] as { _id: { $in: unknown[] } })._id.$in.length,
      2,
    );
  });
});
