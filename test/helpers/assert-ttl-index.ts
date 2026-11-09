import { Model } from 'mongoose';

export const assertTtlIndex = async <T>(
  model: Model<T>,
  field: string,
  expireAfterSeconds = 0,
): Promise<void> => {
  await model.init();
  const indexes = await model.collection.indexes();

  assert.ok(
    indexes.some(
      (index) =>
        index.key[field] === 1 &&
        index.expireAfterSeconds === expireAfterSeconds,
    ),
    `Expected a TTL index on ${field}`,
  );
};
