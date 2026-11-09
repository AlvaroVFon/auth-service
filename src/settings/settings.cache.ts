/** Short TTL of the resolved settings cache. */
export const SETTINGS_CACHE_TTL_MS = 30_000;

/** Upper bound of cached application policies. */
export const SETTINGS_CACHE_MAX_ENTRIES = 500;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Minimal in-memory cache with a short TTL and a bounded size. The oldest
 * inserted entry is evicted first, so the map cannot grow without bound when
 * many applications are resolved.
 */
export class SettingsCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly ttlMs: number = SETTINGS_CACHE_TTL_MS,
    private readonly maxEntries: number = SETTINGS_CACHE_MAX_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);

    if (entry === undefined) {
      return undefined;
    }

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    this.evictExpired();

    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }

    this.entries.set(key, {
      value,
      expiresAt: this.now() + this.ttlMs,
    });
  }

  invalidate(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private evictExpired(): void {
    const now = this.now();

    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}
