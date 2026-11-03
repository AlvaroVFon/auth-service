import assert from 'node:assert';

type ErrorConstructor = abstract new (...args: never[]) => Error;

export const assertSingleRaceFailure = <T>(
  results: PromiseSettledResult<T>[],
  errorClass: ErrorConstructor,
  message: string,
): void => {
  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  assert.strictEqual(fulfilled.length, 1, 'exactly one call must succeed');
  assert.ok(rejected, 'exactly one call must fail');
  assert.ok(rejected.reason instanceof errorClass);
  assert.strictEqual(rejected.reason.message, message);
};
