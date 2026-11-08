import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import { ensureGlobalSettings } from '../../../../src/settings/settings.seed';

const buildModel = () => {
  const updateOne = mock.fn(async () => ({}));

  return { model: { updateOne } as never, updateOne };
};

describe('ensureGlobalSettings', () => {
  test('seeds the policy values with $setOnInsert', async () => {
    const { model, updateOne } = buildModel();

    await ensureGlobalSettings(model, {
      appName: 'Seeded',
      accessTokenTtlSeconds: 120,
    });

    assert.strictEqual(updateOne.mock.callCount(), 1);
    const [filter, update, options] = updateOne.mock.calls[0]!.arguments as [
      unknown,
      Record<string, unknown>,
      unknown,
    ];

    assert.deepStrictEqual(filter, { _id: 'global' });
    assert.deepStrictEqual(update, {
      $setOnInsert: { appName: 'Seeded', accessTokenTtlSeconds: 120 },
    });
    assert.strictEqual('$set' in update, false);
    assert.deepStrictEqual(options, {
      upsert: true,
      setDefaultsOnInsert: true,
    });
  });

  test('rejects an invalid environment value before touching the model', async () => {
    const { model, updateOne } = buildModel();

    await assert.rejects(
      ensureGlobalSettings(model, { accessTokenTtlSeconds: -1 }),
      InvalidArgumentError,
    );

    assert.strictEqual(updateOne.mock.callCount(), 0);
  });
});
