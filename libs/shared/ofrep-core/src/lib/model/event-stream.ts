/**
 * A structured endpoint for SSE connections.
 * Providers construct the URL as `origin + requestUri`.
 */
export interface EventStreamEndpoint {
  /**
   * The origin of the SSE endpoint (e.g. "https://example.com").
   * Optional per ADR-0008; when absent, providers should fall back to the configured OFREP baseUrl origin.
   */
  origin?: string;
  requestUri: string;
}

/**
 * A real-time change notification connection endpoint from the OFREP bulk evaluation response.
 * Per ADR-0008, providers must ignore entries with unknown `type` values.
 */
export interface EventStream {
  /**
   * The connection type. Currently only `"sse"` is defined.
   */
  type: string;
  /**
   * The endpoint URL. May include auth tokens or channel identifiers.
   */
  url?: string;
  /**
   * Structured endpoint components for proxy deployments.
   */
  endpoint?: EventStreamEndpoint;
  /**
   * Seconds of client inactivity after which the connection should be closed.
   * Default: 120 seconds.
   */
  inactivityDelaySec?: number;
}

/**
 * The payload of an SSE event delivered over an {@link EventStream} connection.
 * Per ADR-0008, a `refetchEvaluation` event signals that the client should
 * re-fetch the bulk evaluation, optionally carrying cache-validation metadata.
 */
export interface EventStreamMessage {
  /**
   * The event type. Currently only `"refetchEvaluation"` is defined; clients
   * must ignore events with unknown `type` values for forward compatibility.
   */
  type: string;
  /** ETag of the flag configuration that triggered the event. */
  etag?: string;
  /** Last-modified timestamp of the flag configuration. */
  lastModified?: string | number;
}
