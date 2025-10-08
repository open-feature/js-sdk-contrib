/**
 * Wrapper object so we can easily handle falsy/undefined values.
 */
type Entry<T> = {
  value: T;
  expiry: number;
};

type Options = {
  /**
   * A positive integer setting the max number of items in the cache before the oldest entry is removed.
   */
  maxItems: number;
  /**
   * Time to live for items in cache in milliseconds.
   */
  ttlMs: number;
};

/**
 * A very simple cache which lazily evicts and expires keys.
 * The cache has a fixed max size, and when that size is exceeded, the oldest key is evicted based on insertion order.
 * When a key is retrieved, if it has expired, it is removed from the cache and undefined is returned.
 * If a key is set that already exists, it is updated and its recency (but not it's TTL) is updated.
 */
export class FixedSizeExpiringCache<T> {
  private cacheMap = new Map<string, Entry<T>>();
  private readonly maxItems: number;
  private readonly ttl: number;

  constructor(options: Options) {
    if (options.maxItems < 1) {
      throw new Error('maxItems must be a positive integer');
    }
    this.maxItems = options.maxItems;
    if (options.ttlMs < 1) {
      throw new Error('ttlMs must be a positive integer');
    }
    this.ttl = options.ttlMs;
  }

  /**
   * Gets a key from the cache.
   *
   * @param key key for the entry
   * @returns value or key or undefined
   */
  get(key: string): T | void {
    if (key) {
      const entry = this.cacheMap.get(key);
      if (entry) {
        if (entry.expiry > Date.now()) {
          return entry.value;
        } else {
          this.cacheMap.delete(key); // expired
        }
      }
    }
  }

  /**
   * Sets a key in the cache.
   * If the cache is already at it's maxItems, the oldest key is evicted.
   *
   * @param key key for the entry; if falsy, the function will no-op
   * @param value value for the entry
   */
  set(key: string, value: T) {
    if (key) {
      if (this.cacheMap.size >= this.maxItems) {
        this.evictOldest();
      }
      // delete first so that the order is updated when we re-set (Map keeps insertion order)
      // this is only relevant for eviction when at max size
      this.cacheMap.delete(key);
      this.cacheMap.set(key, {
        value,
        expiry: Date.now() + this.ttl,
      });
    }
  }

  /**
   * Removes the oldest key
   */
  private evictOldest() {
    // Map keeps insertion order, so the first key is the oldest
    // this is only relevant when at max size
    const oldestKey = this.cacheMap.keys().next();
    if (!oldestKey.done) {
      this.cacheMap.delete(oldestKey.value);
    }
  }
}
