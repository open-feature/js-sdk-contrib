import type { OFREPProviderBaseOptions } from '@openfeature/ofrep-core';

export type CacheMode = 'local-cache-first' | 'network-first' | 'disabled';

/** Default cache TTL: 30 days in seconds. */
export const DEFAULT_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

export type OFREPWebProviderOptions = OFREPProviderBaseOptions & {
  /**
   * pollInterval is the time in milliseconds to wait between calls to the OFREP
   * API to get the latest evaluation of your flags.
   *
   * If a negative number or 0 is provided, the provider will not poll the OFREP API.
   * This is the default behavior. Polling is available as an opt-in configuration.
   * Default: 0 (disabled)
   */
  pollInterval?: number;

  /**
   * When set to true, disables the automatic flag re-fetch that occurs whenever the
   * page becomes visible (e.g. user switches back to the tab).
   *
   * Default: false (visibility refresh is enabled by default, per ADR-0010)
   */
  disableVisibilityRefresh?: boolean;

  /**
   * Client-side override for the SSE inactivity timeout in seconds.
   * When set, this takes precedence over the server-provided `inactivityDelaySec`.
   * If neither is set, defaults to 120 seconds.
   */
  inactivityDelaySec?: number;

  /**
   * Controls the background change-detection strategy per ADR-0008.
   *
   * - `'sse'` (default): use SSE when the server advertises event streams, fall back to polling.
   * - `'polling'`: always use polling, even when the server returns `eventStreams`.
   * - `'none'`: no background refresh; flags are only re-fetched on explicit context changes.
   */
  changeDetection?: 'sse' | 'polling' | 'none';

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
   * cacheTTL is the maximum age (in seconds) of a persisted cache entry before it is
   * treated as a cache miss. Expired entries are removed from storage on read.
   *
   * Default: 2_592_000 (30 days)
   */
  cacheTTL?: number;

  /**
   * cacheKeyPrefix is included in the cache key hash to prevent collisions when multiple
   * OFREP provider instances share the same storage partition (e.g. the same browser origin).
   * When set, the cache key is `hash(cacheKeyPrefix + ":" + baseUrl + ":" + context)`.
   *
   * A sensible value is a project key or any other string that uniquely identifies this provider.
   */
  cacheKeyPrefix?: string;
};
