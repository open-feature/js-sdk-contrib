import type { Logger } from '@openfeature/core';
import { AbstractFlagChangeStrategy } from './flag-change-strategy';
import type { FlagChangeEvent, ServerSentEventFlagChangeStrategyOptions } from './model';
import type { GOFeatureFlagServerSentEventResponse } from '../model';

export class ServerSentEventFlagChangeStrategy extends AbstractFlagChangeStrategy<ServerSentEventFlagChangeStrategyOptions> {
  // the WebSocket path on the relay-proxy
  private static readonly _GOFF_SSE_PATH = 'stream/v1/sse/flag/change';
  // _websocket is the reference to the websocket connection
  private _eventSource?: EventSource;

  public readonly name = ServerSentEventFlagChangeStrategy.name;

  constructor(options: ServerSentEventFlagChangeStrategyOptions, logger?: Logger) {
    super(options, logger);
    this.buildSourceUrl();
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
    const sse = (this._eventSource = new EventSource(this._sourceUrl, { withCredentials: true }));

    sse.onopen = (event) => {
      if (signal.aborted) return;
      this._logger?.info(`${this.name}: SSE EventSource to go-feature-flag open: ${event}`);
      this.setStatus('connected');
    };

    sse.onmessage = ({ data }) => {
      if (signal.aborted) return;
      // don't do anything if not in connected status
      if (this.status !== 'connected') {
        this._logger?.warn(
          `${this.name}: skipping incoming messages since the instance is not in connected state. Current state: ${this.status}`,
        );
        return;
      }
      this._logger?.info(`${this.name}: Change in your configuration flag`);
      const payload: GOFeatureFlagServerSentEventResponse = JSON.parse(data);
      const changeEvent = this.buildFlagChangeEvent(payload);
      this.notifyFlagChange(changeEvent);
    };

    sse.onerror = async (event: Event) => {
      if (signal.aborted) return;
      this._logger?.error(`${this.name}: Error while connecting to SSE EventSource: ${event}`);
      this.setStatus('error');
    };
  }

  protected async onClose(): Promise<void> {
    // let's close the websocket
    this._eventSource?.close();
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
