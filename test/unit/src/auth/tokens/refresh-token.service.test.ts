import { Model, Types } from 'mongoose';

import type { RefreshToken } from '../../../../../src/auth/tokens/refresh-token.interface';
import { RefreshTokenService } from '../../../../../src/auth/tokens/refresh-token.service';

const token = (index: number) => ({
  _id: new Types.ObjectId(),
  userId: new Types.ObjectId(),
  sessionId: `session-${index}`,
  jti: `jti-${index}`,
});

const buildModel = (batchSizes: number[]): Model<RefreshToken> => {
  let call = 0;
  const find = () => ({
    select: () => ({
      limit: () => ({
        lean: async () => {
          const size = batchSizes[Math.min(call, batchSizes.length - 1)] ?? 0;
          call += 1;
          return Array.from({ length: size }, (_, index) => token(index));
        },
      }),
    }),
  });
  const updateMany = async () => ({ modifiedCount: 0 });

  return { find, updateMany } as unknown as Model<RefreshToken>;
};

describe('RefreshTokenService.revokeAllByAudience completion', () => {
  test('reports an incomplete revocation when every pass is a full batch', async () => {
    const service = new RefreshTokenService(
      buildModel([500, 500, 500, 500, 500]),
    );

    const result = await service.revokeAllByAudience('app-aud');

    assert.strictEqual(result.complete, false);
    assert.strictEqual(result.sessions.length, 2_500);
  });

  test('reports completion when the last pass is below the batch size', async () => {
    const service = new RefreshTokenService(buildModel([2, 0]));

    const result = await service.revokeAllByAudience('app-aud');

    assert.strictEqual(result.complete, true);
    assert.strictEqual(result.sessions.length, 2);
  });
});
