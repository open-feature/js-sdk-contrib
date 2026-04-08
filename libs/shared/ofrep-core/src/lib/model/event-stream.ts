/**
 * A structured endpoint for SSE connections.
 * Providers construct the URL as `origin + requestUri`.
 */
export interface EventStreamEndpoint {
  origin: string;
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
