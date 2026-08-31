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
  signal: AbortSignal;
};

/**
 * The specific implementation of a {@link FlagChangeStrategy} for flag change detection through Server-Sent Event (SSE).
 */
export class ServerSentEventFlagChangeStrategy extends AbstractFlagChangeStrategy<ServerSentEventFlagChangeStrategyOptions> {
  // the SSE path on the relay-proxy
  private static readonly _GOFF_SSE_PATH = 'stream/v1/sse/flag/change';
  // the internal context
  private _ctx?: SseContext;

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

  /**
   * The EventSource instance associated to this strategy
   */
  public get source() {
    return this._ctx?.source;
  }

  protected override async onConnect(signal: AbortSignal): Promise<void> {
    if (this._ctx?.signal === signal) return;
    this._logger?.info(
      `${this.name}: Trying to connect the SSE EventSource at ${this._sourceUrl.origin}${this._sourceUrl.pathname}`,
    );
    this.buildSourceUrl();
    const ctx = (this._ctx = {
      source: new EventSource(this._sourceUrl),
      signal,
    } as SseContext);
    const abortHandler = this.getAbortHandler(ctx);

    ctx.source.onopen = (event) => {
      if (signal.aborted || this._ctx !== ctx) return;
      this._logger?.info(`${this.name}: SSE EventSource to go-feature-flag open: ${event}`);
      this.setStatus('connected');
    };

    ctx.source.onmessage = ({ data }) => {
      if (signal.aborted || this._ctx !== ctx) return;
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

    ctx.source.onerror = async () => {
      if (signal.aborted || this._ctx !== ctx) return;
      // check if it's an error due closing
      switch (ctx.closeReason) {
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
      // Check if there is auto-reconnection in place
      if (ctx.source.readyState === EventSource.CONNECTING) {
        this._logger?.warn(`${this.name}: Reconnecting to SSE EventSource`);
      } else {
        this._logger?.error(`${this.name}: Error while connecting to SSE EventSource`);
        // we clean-up the context so that future calls to onConnect() can be processed
        this._ctx = undefined;
      }
      // If we're connecting, we notify only internally
      this.setStatus('error', this.status === 'connecting');
    };

    signal.addEventListener('abort', abortHandler, { once: true });
  }

  protected async onDisconnect(): Promise<void> {
    if (this._ctx) {
      this._ctx.closeReason = 'disconnect';
      this._ctx.source.close();
    }
    await Promise.resolve();
  }

  protected async onClose(): Promise<void> {
    if (this._ctx) {
      this._ctx.closeReason = 'close';
      this._ctx.source.close();
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
