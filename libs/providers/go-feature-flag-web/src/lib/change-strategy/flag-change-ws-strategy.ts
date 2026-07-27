import type { Logger } from '@openfeature/core';
import type { FlagChangeEvent, WebSocketFlagChangeStrategyOptions } from './model';
import type { GOFeatureFlagWebsocketResponse } from '../model';
import { AbstractFlagChangeStrategy } from './flag-change-strategy';

export class WebSocketFlagChangeStrategy extends AbstractFlagChangeStrategy<WebSocketFlagChangeStrategyOptions> {
  // the WebSocket path on the relay-proxy
  private static readonly _GOFF_WEBSOCKET_PATH = 'stream/v1/ws/flag/change';
  private static readonly _WEBSOCKET_NORMAL_CLOSURE = 1_000;
  // _websocket is the reference to the websocket connection
  private _websocket?: WebSocket;

  public readonly name = WebSocketFlagChangeStrategy.name;

  constructor(options: WebSocketFlagChangeStrategyOptions, logger?: Logger) {
    super(options, logger);
    this.buildSourceUrl();
  }

  private buildSourceUrl() {
    this._sourceUrl = new URL(this._options.endpoint);
    this._sourceUrl.pathname += this._sourceUrl.pathname.endsWith('/')
      ? WebSocketFlagChangeStrategy._GOFF_WEBSOCKET_PATH
      : '/' + WebSocketFlagChangeStrategy._GOFF_WEBSOCKET_PATH;
    this._sourceUrl.protocol = this._sourceUrl.protocol === 'https:' ? 'wss' : 'ws';

    // adding API Key if GO Feature Flag use api keys.
    if (this._options.apiKey) {
      this._sourceUrl.searchParams.set('apiKey', this._options.apiKey);
    }
  }

  protected override async onConnect(signal: AbortSignal): Promise<void> {
    this._logger?.info(
      `${this.name}: Trying to connect the websocket at ${this._sourceUrl.origin}${this._sourceUrl.pathname}`,
    );
    this.buildSourceUrl();
    const ws = (this._websocket = new WebSocket(this._sourceUrl));

    ws.onopen = (event) => {
      if (signal.aborted) return;
      this._logger?.info(`${this.name}: Websocket to go-feature-flag open: ${event}`);
      this.setStatus('connected');
    };

    ws.onmessage = ({ data }) => {
      if (signal.aborted) return;
      // Usually `onmessage` should not fire after `onerror` or `onclose` fired,
      // anyway we still add an additional layer of check for the message to be valid in the session
      if (this.status !== 'connected') {
        this._logger?.warn(
          `${this.name}: skipping incoming messages since the instance is not in connected state. Current state: ${this.status}`,
        );
        return;
      }
      this._logger?.info(`${this.name}: Change in your configuration flag`);
      const payload: GOFeatureFlagWebsocketResponse = JSON.parse(data);
      const changeEvent = this.buildFlagChangeEvent(payload);
      this.notifyFlagChange(changeEvent);
    };

    ws.onclose = (e: CloseEvent) => {
      if (signal.aborted) return;
      this._logger?.warn(`${this.name}: Websocket closed, reason: ${e.reason}.`);
      this.setStatus('error');
    };

    ws.onerror = (event: Event) => {
      if (signal.aborted) return;
      this._logger?.error(`${this.name}: Error while connecting the websocket: ${event}`);
      this.setStatus('error');
    };

    signal.addEventListener(
      'abort',
      () => {
        ws.close(undefined, 'WebSocket connection was cancelled');
      },
      { once: true },
    );
  }

  protected async onClose(): Promise<void> {
    // let's close the websocket
    this._websocket?.close(1000, `Connection closed by client`);
    await Promise.resolve();
  }

  /**
   * extract flag names from the websocket answer
   */
  private buildFlagChangeEvent(res: GOFeatureFlagWebsocketResponse): FlagChangeEvent {
    return {
      added: res.added ? Object.keys(res.added) : [],
      updated: res.updated ? Object.keys(res.updated) : [],
      deleted: res.deleted ? Object.keys(res.deleted) : [],
    } as FlagChangeEvent;
  }
}
