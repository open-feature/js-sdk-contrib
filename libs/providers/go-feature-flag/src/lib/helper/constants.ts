/**
 * Constants used throughout the GO Feature Flag API.
 */
export const HTTP_HEADER_CONTENT_TYPE = 'Content-Type';
export const HTTP_HEADER_IF_NONE_MATCH = 'If-None-Match';
export const HTTP_HEADER_ETAG = 'etag';
export const HTTP_HEADER_LAST_MODIFIED = 'last-modified';
export const APPLICATION_JSON = 'application/json';

/**
 * The header carrying `apiKey` on every call to the relay proxy.
 *
 * The relay proxy accepts `X-API-Key` and `Authorization: Bearer` and resolves `X-API-Key` first.
 * The exact casing matters: request headers are carried as a plain object, so a mismatch would go
 * out on the wire verbatim.
 */
export const HTTP_HEADER_API_KEY = 'X-API-Key';

/**
 * Header names a caller may never set, whether or not the provider is sending one itself.
 *
 * Both are transport details rather than credentials. `Content-Type` must match a body this
 * provider serialises, and on the remote path it is absent from the request the delegate is given
 * precisely because the delegate sets it — so a caller value would be appended, not replaced.
 * `If-None-Match` belongs to the polling loop and is absent exactly when there is no etag, so a
 * static value would freeze the configuration.
 *
 * `X-API-Key` is deliberately **not** here. It is protected only while `apiKey` is set, by the
 * ordinary rule that the provider's own headers win; with no `apiKey` configured, a caller who
 * writes one into `headers` has asked for it explicitly, the same as any other credential they
 * supply that way.
 */
export const RESERVED_HEADERS: readonly string[] = [HTTP_HEADER_CONTENT_TYPE, HTTP_HEADER_IF_NONE_MATCH];

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UNAVAILABLE: 503,
  NOT_MODIFIED: 304,
} as const;

export const DEFAULT_FLUSH_INTERVAL_MS = 60000;
export const DEFAULT_MAX_PENDING_EVENTS = 10000;
export const DEFAULT_POLLING_INTERVAL_MS = 120000;

/**
 * Consecutive failed configuration refreshes after which the provider reports itself stale.
 * Below this, a refresh failure is treated as a transient blip and is only logged.
 */
export const STALE_AFTER_CONSECUTIVE_FAILURES = 3;

export const DEFAULT_TARGETING_KEY = 'undefined-targetingKey';

/**
 * Evaluation-context key of the GO Feature Flag reserved namespace.
 * It is shared: the provider owns `exporterMetadata`, the caller owns `flagList` and
 * `currentDateTime`.
 */
export const GO_FEATURE_FLAG_CONTEXT_KEY = 'gofeatureflag';

/** Key within the reserved namespace under which the relay proxy reads the exporter metadata. */
export const EXPORTER_METADATA_KEY = 'exporterMetadata';

/**
 * Exporter-metadata keys the provider always contributes, whatever the caller configured.
 *
 * They are a wire contract shared with the relay proxy and with every other GO Feature Flag
 * provider: `provider` is the lowercase language identifier the collector groups by, and
 * `openfeature` marks the events as coming from an OpenFeature SDK rather than a native client.
 * Without them an exported event cannot be attributed to an SDK at all.
 */
export const RESERVED_EXPORTER_METADATA = Object.freeze({
  provider: 'nodejs',
  openfeature: true,
} as const);
