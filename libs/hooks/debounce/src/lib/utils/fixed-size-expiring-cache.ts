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
   * Gets a key from the cache, updating its recency.
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
    const oldestKey = this.cacheMap.keys().next();
    if (!oldestKey.done) {
      this.cacheMap.delete(oldestKey.value);
    }
  }
}
