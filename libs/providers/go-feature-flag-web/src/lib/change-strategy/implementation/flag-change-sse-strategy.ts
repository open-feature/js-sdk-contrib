import type { Logger } from '@openfeature/core';
import { AbstractFlagChangeStrategy } from '../flag-change-strategy';
import type { FlagChangeEvent, ServerSentEventFlagChangeStrategyOptions } from '../model';
import type { GOFeatureFlagServerSentEventResponse } from '../../model';

/**
 * (internal) used by {@link ServerSentEventFlagChangeStrategy} to track internal context.
 */
type SseContext = {
  source: EventSource;
  closeReason?: 'aborted' | 'disconnect' | 'close';
};

/**
 * The specific implementation of a {@link FlagChangeStrategy} for flag change detection through Server-Sent Event (SSE).
 */
export class ServerSentEventFlagChangeStrategy extends AbstractFlagChangeStrategy<ServerSentEventFlagChangeStrategyOptions> {
  // the WebSocket path on the relay-proxy
  private static readonly _GOFF_SSE_PATH = 'stream/v1/sse/flag/change';
  // _websocket is the reference to the websocket connection
  private _sseContext?: SseContext;

  public readonly name = ServerSentEventFlagChangeStrategy.name;

  constructor(options: ServerSentEventFlagChangeStrategyOptions, logger?: Logger) {
    super(options, logger);
    this.buildSourceUrl();
  }

  private getAbortHandler(ctx: SseContext) {
    return () => {
      ctx.closeReason = 'aborted';
      ctx.source.close();
    };
  }

  private buildSourceUrl() {
    this._sourceUrl = new URL(this._options.endpoint);
    this._sourceUrl.pathname += this._sourceUrl.pathname.endsWith('/')
      ? ServerSentEventFlagChangeStrategy._GOFF_SSE_PATH
      : '/' + ServerSentEventFlagChangeStrategy._GOFF_SSE_PATH;

    // adding API Key if GO Feature Flag use api keys.
    if (this._options.apiKey) {
      this._sourceUrl.searchParams.set('apiKey', this._options.apiKey);
    }
  }

  protected override async onConnect(signal: AbortSignal): Promise<void> {
    this._logger?.info(
      `${this.name}: Trying to connect the SSE EventSource at ${this._sourceUrl.origin}${this._sourceUrl.pathname}`,
    );
    this.buildSourceUrl();
    const sseContext = (this._sseContext = {
      source: new EventSource(this._sourceUrl, { withCredentials: true }),
    } as SseContext);
    const abortHandler = this.getAbortHandler(sseContext);

    sseContext.source.onopen = (event) => {
      if (signal.aborted) return;
      this._logger?.info(`${this.name}: SSE EventSource to go-feature-flag open: ${event}`);
      this.setStatus('connected');
    };

    sseContext.source.onmessage = ({ data }) => {
      if (signal.aborted) return;
      // don't do anything if not in connected status
      if (this.status !== 'connected') {
        this._logger?.warn(
          `${this.name}: skipping incoming messages since the instance is not in connected state. Current state: ${this.status}`,
        );
        return;
      }
      this._logger?.info(`${this.name}: Change in your configuration flag`);
      try {
        const payload: GOFeatureFlagServerSentEventResponse = typeof data === 'string' ? JSON.parse(data) : data;
        const changeEvent = this.buildFlagChangeEvent(payload);
        this.notifyFlagChange(changeEvent);
      } catch (err) {
        // Do nothing
        this._logger?.error(`${this.name} An error occurred while sending flag change event`, err);
      }
    };

    sseContext.source.onerror = async (event: Event) => {
      if (signal.aborted) return;
      // check if it's an error due closing
      switch (sseContext.closeReason) {
        case 'aborted':
          // nothing to do
          return;
        case 'disconnect':
          // set status to idle
          return this.setStatus('idle');
        case 'close':
          // set the status to close
          return this.setStatus('closed');
      }
      // Check if ther is auto-reconnection in place
      if (sseContext.source.readyState === EventSource.CONNECTING) {
        this._logger?.warn(`${this.name}: Reconnecting to SSE EventSource`);
        this.setStatus('connecting');
      } else {
        this._logger?.error(`${this.name}: Error while connecting to SSE EventSource`);
        this.setStatus('error');
      }
    };

    signal.addEventListener('abort', abortHandler, { once: true });
  }

  protected async onDisconnect(): Promise<void> {
    if (this._sseContext) {
      this._sseContext.closeReason = 'disconnect';
      this._sseContext.source.close();
      this._sseContext = undefined;
    }
    await Promise.resolve();
  }

  protected async onClose(): Promise<void> {
    if (this._sseContext) {
      this._sseContext.closeReason = 'close';
      this._sseContext.source.close();
      this._sseContext = undefined;
    }
    await Promise.resolve();
  }

  /**
   * extract flag names from the SSE EventSource messages
   */
  private buildFlagChangeEvent(res: GOFeatureFlagServerSentEventResponse): FlagChangeEvent {
    return {
      added: res.added ? Object.keys(res.added) : [],
      updated: res.updated ? Object.keys(res.updated) : [],
      deleted: res.deleted ? Object.keys(res.deleted) : [],
    } as FlagChangeEvent;
  }
}
