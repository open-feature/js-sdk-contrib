import type { EventStream } from '@openfeature/ofrep-core';
import type { Logger } from '@openfeature/web-sdk';

const DEFAULT_INACTIVITY_DELAY_SEC = 120;
const DEBOUNCE_MS = 50;

/**
 * Metadata from an SSE `refetchEvaluation` event.
 */
export interface SseRefetchMetadata {
  flagConfigEtag?: string;
  flagConfigLastModified?: string | number;
}

/**
 * Callbacks the SseManager invokes on events.
 */
export interface SseManagerCallbacks {
  onRefetch: (metadata?: SseRefetchMetadata) => void;
  onError: () => void;
}

/**
 * Resolves the connection URL from an EventStream entry.
 */
function resolveUrl(stream: EventStream): string | undefined {
  if (stream.url) {
    return stream.url;
  }
  if (stream.endpoint) {
    return new URL(stream.endpoint.requestUri, stream.endpoint.origin).href;
  }
  return undefined;
}

/**
 * Manages EventSource connections for real-time flag change notifications.
 * Handles connection lifecycle, event coalescing, and inactivity timeouts.
 */
export class SseManager {
  private _connections: EventSource[] = [];
  private _urls: Set<string> = new Set();
  private _inactivityDelaySec: number;
  private _inactivityTimerId?: ReturnType<typeof setTimeout>;
  private _debounceTimerId?: ReturnType<typeof setTimeout>;
  private _pendingMetadata?: SseRefetchMetadata;
  private _disposed = false;
  private _visibilityHandler?: () => void;

  constructor(
    private _callbacks: SseManagerCallbacks,
    private _clientInactivityOverride?: number,
    private _logger?: Logger,
  ) {
    this._inactivityDelaySec = _clientInactivityOverride ?? DEFAULT_INACTIVITY_DELAY_SEC;
  }

  /**
   * Connect to SSE endpoints from eventStreams entries.
   * Closes any existing connections first.
   */
  connect(eventStreams: EventStream[]): void {
    this.disconnect();

    const sseStreams = eventStreams.filter((s) => s.type === 'sse');
    if (sseStreams.length === 0) {
      return;
    }

    // Determine effective inactivity delay:
    // 1. Client override > 2. Server value > 3. Default (120s)
    const serverInactivity = sseStreams.find((s) => s.inactivityDelaySec != null)?.inactivityDelaySec;
    this._inactivityDelaySec = this._clientInactivityOverride ?? serverInactivity ?? DEFAULT_INACTIVITY_DELAY_SEC;

    const urls = sseStreams.reduce<Set<string>>((acc, stream) => {
      const url = resolveUrl(stream);
      if (url) acc.add(url);
      return acc;
    }, new Set());

    if (urls.size === 0) {
      return;
    }

    this._urls = urls;
    urls.forEach((url) => this._connectToUrl(url));

    this._setupVisibilityHandler();
  }

  /**
   * Close all EventSource connections and clean up timers.
   */
  disconnect(): void {
    this._clearDebounce();
    this._clearInactivityTimer();
    this._removeVisibilityHandler();

    for (const conn of this._connections) {
      conn.close();
    }
    this._connections = [];
    this._urls = new Set();
  }

  /**
   * Full cleanup — disconnect and mark as disposed.
   */
  dispose(): void {
    this._disposed = true;
    this.disconnect();
  }

  /**
   * Whether the manager has active connections.
   */
  get isConnected(): boolean {
    return this._connections.length > 0;
  }

  /**
   * The set of currently connected URLs.
   */
  get connectedUrls(): ReadonlySet<string> {
    return this._urls;
  }

  private _connectToUrl(url: string): void {
    if (this._disposed) {
      return;
    }

    const es = new EventSource(url);

    es.addEventListener('message', (event: MessageEvent) => {
      this._handleMessage(event);
    });

    es.addEventListener('error', () => {
      this._logger?.warn('SSE connection error for URL: ' + url);
      // EventSource auto-reconnects; if all connections fail,
      // the provider-level error callback triggers polling fallback.
      this._callbacks.onError();
    });

    this._connections.push(es);
  }

  private _handleMessage(event: MessageEvent): void {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

      if (data.type !== 'refetchEvaluation') {
        // Ignore unknown event types for forward compatibility
        return;
      }

      const metadata: SseRefetchMetadata = {};
      if (data.etag) {
        metadata.flagConfigEtag = data.etag;
      }
      if (data.lastModified !== undefined) {
        metadata.flagConfigLastModified = data.lastModified;
      }

      // Coalesce rapid events via debounce
      this._pendingMetadata = metadata;
      this._clearDebounce();
      this._debounceTimerId = setTimeout(() => {
        const meta = this._pendingMetadata;
        this._pendingMetadata = undefined;
        this._callbacks.onRefetch(meta);
      }, DEBOUNCE_MS);
    } catch {
      this._logger?.warn('Failed to parse SSE event data');
    }
  }

  private _setupVisibilityHandler(): void {
    if (typeof document === 'undefined') {
      return;
    }

    this._visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        this._startInactivityTimer();
      } else {
        this._cancelInactivityTimer();
      }
    };

    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  private _removeVisibilityHandler(): void {
    if (this._visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = undefined;
    }
  }

  private _startInactivityTimer(): void {
    this._clearInactivityTimer();
    this._inactivityTimerId = setTimeout(() => {
      this._logger?.info('SSE inactivity timeout — closing connections');
      for (const conn of this._connections) {
        conn.close();
      }
      this._connections = [];
    }, this._inactivityDelaySec * 1000);
  }

  private _cancelInactivityTimer(): void {
    if (this._inactivityTimerId !== undefined) {
      clearTimeout(this._inactivityTimerId);
      this._inactivityTimerId = undefined;

      // If connections were closed by the inactivity timeout, reconnect
      if (this._connections.length === 0 && this._urls.size > 0) {
        this._logger?.info('SSE resuming — reconnecting and requesting full re-fetch');
        for (const url of this._urls) {
          this._connectToUrl(url);
        }
        // Unconditional re-fetch (no etag/lastModified)
        this._callbacks.onRefetch(undefined);
      }
    }
  }

  private _clearInactivityTimer(): void {
    if (this._inactivityTimerId !== undefined) {
      clearTimeout(this._inactivityTimerId);
      this._inactivityTimerId = undefined;
    }
  }

  private _clearDebounce(): void {
    if (this._debounceTimerId !== undefined) {
      clearTimeout(this._debounceTimerId);
      this._debounceTimerId = undefined;
    }
  }
}
