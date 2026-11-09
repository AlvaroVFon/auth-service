import { SettingsCache } from '../../../../src/settings';

describe('SettingsCache', () => {
  test('stores and retrieves values', () => {
    const cache = new SettingsCache<string>();

    cache.set('a', 'value');

    assert.strictEqual(cache.get('a'), 'value');
    assert.strictEqual(cache.get('missing'), undefined);
  });

  test('expires an entry after its TTL', () => {
    let now = 1_000;
    const cache = new SettingsCache<string>(500, 10, () => now);

    cache.set('a', 'value');
    now += 499;
    assert.strictEqual(cache.get('a'), 'value');

    now += 1;
    assert.strictEqual(cache.get('a'), undefined);
    assert.strictEqual(cache.size, 0);
  });

  test('invalidates a single key without touching the others', () => {
    const cache = new SettingsCache<string>();

    cache.set('a', 'a');
    cache.set('b', 'b');

    cache.invalidate('a');

    assert.strictEqual(cache.get('a'), undefined);
    assert.strictEqual(cache.get('b'), 'b');
  });

  test('clears every entry', () => {
    const cache = new SettingsCache<string>();

    cache.set('a', 'a');
    cache.set('b', 'b');
    cache.clear();

    assert.strictEqual(cache.size, 0);
  });

  test('evicts the oldest entry when the size limit is reached', () => {
    const cache = new SettingsCache<string>(60_000, 2);

    cache.set('a', 'a');
    cache.set('b', 'b');
    cache.set('c', 'c');

    assert.strictEqual(cache.get('a'), undefined);
    assert.strictEqual(cache.get('b'), 'b');
    assert.strictEqual(cache.get('c'), 'c');
    assert.strictEqual(cache.size, 2);
  });
});
