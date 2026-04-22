import type { OFREPProviderBaseOptions } from '@openfeature/ofrep-core';

export type CacheMode = 'local-cache-first' | 'network-first' | 'disabled';

/** Default cache TTL: 30 days in milliseconds (matching DevCycle's configCacheTTL reference). */
export const DEFAULT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type OFREPWebProviderOptions = OFREPProviderBaseOptions & {
  /**
   * pollInterval is the time in milliseconds to wait between calls to the OFREP
   * API to get the latest evaluation of your flags.
   *
   * If the value is 0 or negative, polling is disabled.
   * Default: 30000
   */
  pollInterval?: number;

  /**
   * cacheMode controls whether and how the provider uses local persistent storage.
   *
   * - `'local-cache-first'` (default): load from the persisted cache immediately on startup
   *   so `initialize()` can return right away, then refresh from the network in the background.
   * - `'network-first'`: block `initialize()` on the network request and only fall back to the
   *   persisted cache on transient or server errors (network unavailable, 5xx, timeout).
   *   Auth and configuration errors (401, 403, 400) are surfaced immediately and never masked
   *   by cached values.
   * - `'disabled'`: no persistence at all. `initialize()` always blocks on the network.
   *   Persistence-related options have no effect.
   *
   * Default: `'local-cache-first'`
   */
  cacheMode?: CacheMode;

  /**
   * cacheTtl is the maximum age (in milliseconds) of a persisted cache entry before it is
   * treated as a cache miss. Expired entries are removed from storage on read.
   *
   * Default: 2_592_000_000 (30 days)
   */
  cacheTtl?: number;

  /**
   * cacheKeyPrefix is included in the cache key hash to prevent collisions when multiple
   * OFREP provider instances share the same storage partition (e.g. the same browser origin).
   * When set, the cache key becomes `hash(cacheKeyPrefix + ":" + targetingKey)`.
   *
   * A sensible value is the OFREP base URL, a project key, or any other string that
   * uniquely identifies this provider instance.
   */
  cacheKeyPrefix?: string;
};
