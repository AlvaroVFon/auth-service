import { Model } from 'mongoose';

export const assertTtlIndex = async <T>(
  model: Model<T>,
  field: string,
): Promise<void> => {
  await model.init();
  const indexes = await model.collection.indexes();

  assert.ok(
    indexes.some(
      (index) => index.key[field] === 1 && index.expireAfterSeconds === 0,
    ),
    `Expected a TTL index on ${field}`,
  );
};
