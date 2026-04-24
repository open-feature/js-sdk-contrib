import type { OFREPProviderBaseOptions } from '@openfeature/ofrep-core';

export type OFREPWebProviderOptions = OFREPProviderBaseOptions & {
  /**
   * pollInterval is the time in milliseconds to wait between we call the OFREP
   * API to get the latest evaluation of your flags.
   *
   * If a negative number is provided, the provider will not poll the OFREP API.
   * Default: 30000
   */
  pollInterval?: number; // in milliseconds

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
};
