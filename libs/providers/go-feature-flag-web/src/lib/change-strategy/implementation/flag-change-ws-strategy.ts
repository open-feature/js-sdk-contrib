import type { Logger } from '@openfeature/core';
import type { FlagChangeEvent, WebSocketFlagChangeStrategyOptions } from '../model';
import type { GOFeatureFlagWebsocketResponse } from '../../model';
import { AbstractFlagChangeStrategy } from '../flag-change-strategy';
import { DeferredPromise } from '../../utils';

/**
 * (internal) used by {@link WebSocketFlagChangeStrategy} to track internal context.
 */
type WebsocketContext = {
  // the reference to the websocket connection
  source: WebSocket;
  // the reason of websocket.close()
  closeReason?: 'aborted' | 'disconnect' | 'close';
  // the signal assoiciated to the context
  signal: AbortSignal;
  waitCompleted?: Promise<void>;
};

/**
 * The specific implementation of a {@link FlagChangeStrategy} for flag change detection through WebSocket.
 */
export class WebSocketFlagChangeStrategy extends AbstractFlagChangeStrategy<WebSocketFlagChangeStrategyOptions> {
  // the WebSocket path on the relay-proxy
  private static readonly _GOFF_WEBSOCKET_PATH = 'stream/v1/ws/flag/change';
  // the context of an active connection
  private _ctx?: WebsocketContext;

  public readonly name = WebSocketFlagChangeStrategy.name;

  constructor(options: WebSocketFlagChangeStrategyOptions, logger?: Logger) {
    super(options, logger);
    this.buildSourceUrl();
  }

  private getAbortHandler(ws: WebSocket) {
    return () => ws.close(1000, 'aborted');
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

  /**
   * The WebSocket instance associated to this strategy
   */
  public get source() {
    return this._ctx?.source;
  }

  protected override async onConnect(signal: AbortSignal): Promise<void> {
    if (this._ctx?.waitCompleted) await this._ctx.waitCompleted;
    // we check if the signal is aborted
    signal.throwIfAborted();

    this._logger?.debug(
      `${this.name}: Trying to connect the websocket at ${this._sourceUrl.origin}${this._sourceUrl.pathname}`,
    );

    this.buildSourceUrl();
    const completeRun = new DeferredPromise();
    const ctx = (this._ctx = {
      source: new WebSocket(this._sourceUrl),
      signal,
      waitCompleted: completeRun.promise,
    } as WebsocketContext);

    const abortHandler = this.getAbortHandler(ctx.source);

    ctx.source.onopen = () => {
      if (signal.aborted || this._ctx !== ctx) return;
      this._logger?.info(`${this.name}: Websocket to go-feature-flag open.`);
      this.setStatus('connected');
    };

    ctx.source.onmessage = ({ data }) => {
      if (signal.aborted || this._ctx !== ctx) return;
      // Usually `onmessage` should not fire after `onerror` or `onclose` fired,
      // anyway we still add an additional layer of check for the message to be valid in the session
      if (this.status !== 'connected') {
        this._logger?.warn(
          `${this.name}: skipping incoming messages since the instance is not in connected state. Current state: ${this.status}`,
        );
        return;
      }
      this._logger?.info(`${this.name}: Change in your configuration flag`);
      try {
        const payload: GOFeatureFlagWebsocketResponse = typeof data === 'string' ? JSON.parse(data) : data;
        const changeEvent = this.buildFlagChangeEvent(payload);
        this.notifyFlagChange(changeEvent);
      } catch (err) {
        // Do nothing
        this._logger?.error(`${this.name} An error occurred while sending flag change event`, err);
      }
    };

    ctx.source.onclose = (e: CloseEvent) => {
      completeRun.resolve();
      if (signal.aborted || this._ctx !== ctx) return;
      this._logger?.warn(`${this.name}: Websocket closed => code: ${e.code}, reason: ${e.reason}.`);
      // we clean-up the context so that future calls to onConnect() can be processed
      this._ctx = undefined;
      // detach the abort handler
      signal.removeEventListener('abort', abortHandler);
      // check if it's an expected closing
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
      // if we're here, something went wrong. If we're connecting, we notify only internally
      this._logger?.debug(`${this.name}: WebSocket closed => reason: ${ctx.closeReason}.`);
      this.setStatus('error', this.status === 'connecting');
    };

    ctx.source.onerror = () => {
      completeRun.resolve();
      if (signal.aborted || this._ctx !== ctx) return;
      this._logger?.error(`${this.name}: Error while connecting the WebSocket`);
      // we clean-up the context so that future calls to onConnect() can be processed
      this._ctx = undefined;
      // If we're connecting, we notify only internally
      this.setStatus('error', this.status === 'connecting');
    };

    signal.addEventListener('abort', abortHandler, { once: true });
  }

  protected async onDisconnect(): Promise<void> {
    if (this._ctx) {
      this._ctx.closeReason = 'disconnect';
      this._ctx.source.close(1000, this._ctx.closeReason);
    }
    await Promise.resolve();
  }

  protected async onClose(): Promise<void> {
    if (this._ctx) {
      this._ctx.closeReason = 'close';
      this._ctx.source.close(1000, this._ctx.closeReason);
    }
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
