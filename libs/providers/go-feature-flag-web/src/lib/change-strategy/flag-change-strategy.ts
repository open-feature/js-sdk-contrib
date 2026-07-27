import type { Logger } from '@openfeature/core';
import type {
  FlagChangeEvent,
  FlagChangeStrategy,
  FlagChangeStrategyHandlerRef,
  FlagChangeStrategyOnFlagChangeHandler,
  FlagChangeStrategyOnStatusChangeHandler,
  FlagChangeStrategyOptions,
} from './model';
import { awaitableTimeout, DeferredPromise, isAbortError, type PromiseOptions, whenAnySettle } from '../utils';
import { buildOptionsWithDefaults } from './utils';

export abstract class AbstractFlagChangeStrategy<
  TOptions extends FlagChangeStrategyOptions,
> implements FlagChangeStrategy {
  protected static readonly _DEFAULT_CONNECTION_TIMEOUT = 5_000;
  protected readonly _options: TOptions;
  protected _sourceUrl: URL;
  protected readonly _logger?: Logger;
  private _status: FlagChangeStrategy['status'] = 'idle';
  private _disposing = false;
  private _abortController = new AbortController();
  private _onFlagChangeHandlers: Set<FlagChangeStrategyOnFlagChangeHandler>;
  private _onStatusChangeHandlers: Set<FlagChangeStrategyOnStatusChangeHandler>;

  public abstract readonly name: string;

  protected renewSession() {
    const old = this._abortController;
    this._abortController = new AbortController();
    old.abort();
  }

  get status() {
    return this._status;
  }

  get disposing() {
    return this._disposing;
  }

  constructor(options: TOptions, logger?: Logger) {
    this._options = buildOptionsWithDefaults<TOptions>(options);
    // the following line will throw an Error if the endpoint is invalid
    this._sourceUrl = new URL(this._options.endpoint);
    this._onFlagChangeHandlers = new Set();
    this._onStatusChangeHandlers = new Set();
    this._logger = logger;
  }

  connect(): void {
    // Don't do anything if the instance is already disposing or running
    if (
      this._disposing ||
      this._abortController.signal.aborted ||
      this.status === 'connecting' ||
      this.status === 'connected'
    ) {
      this._logger?.warn(
        `${this.name}: Skipping connecting to the source => status: ${this._status}, disposing: ${this._disposing}, aborted: ${this._abortController.signal.aborted}`,
      );
      return;
    }
    // reset the initial state
    this.renewSession();
    this.setStatus('connecting');
    const commonOptions: PromiseOptions = { signal: this._abortController.signal };
    const timeout =
      this._options.connectionTimeoutMs > 0
        ? awaitableTimeout(this._options.connectionTimeoutMs, commonOptions)
        : undefined;
    const connection = this.onConnect(this._abortController.signal).then(() =>
      this.waitForStatus('connected', commonOptions),
    );

    whenAnySettle(timeout ? [timeout, connection] : [connection]).then((settled) => {
      // check for errors first
      if (settled.error) {
        // if the operation was cancelled, do nothing
        if (isAbortError(settled.error)) return;
      } else if (settled.promise === timeout) {
        // it timed out before connecting
        this._logger?.error(
          `${this.name}: Timeout of ${this._options.connectionTimeoutMs} ms reached when connecting to the source`,
        );
        this.setStatus('error');
      } else {
        // it's connected
        this._logger?.info(`${this.name}: Connected to the source`);
        this.setStatus('connected');
      }
    });
  }

  protected abstract onConnect(signal: AbortSignal): Promise<void>;

  close(): void {
    // Check if it's already closed or if it's closing
    if (this._status !== 'closed' && !this._disposing) {
      this._disposing = true;
      this.setStatus('closing');
      this._abortController.abort();
      // clean-up onChange handlers
      this._onFlagChangeHandlers.clear();
      this.onClose()
        .catch((err) => {
          (this._logger || console).error(`${this.name}: Cannot properly clean-up the change strategy`, err);
        })
        .then(() => {
          this.setStatus('closed');
          this._onStatusChangeHandlers.clear();
        });
    }
  }

  protected abstract onClose(): Promise<void>;

  protected async waitForStatus(status: FlagChangeStrategy['status'], options?: PromiseOptions) {
    if (status === this.status) return;
    const ref = new DeferredPromise(options);
    const handlerRef = this.onStatusChange((currentStatus) => {
      if (currentStatus === status) {
        handlerRef.detach();
        ref.resolve();
      }
    });
    await ref.promise.catch((err) => {
      handlerRef.detach();
      throw err;
    });
  }

  setApiKey(apiKey: string): void {
    const oldKey = this._options.apiKey;
    this._options.apiKey = apiKey || '';
    // reconnect if the apiKey is different
    if (oldKey !== this._options.apiKey && !this._disposing) {
      this.renewSession();
      this.reconnect();
    }
  }

  protected notifyFlagChange(event: FlagChangeEvent) {
    if (!this._disposing && this._onFlagChangeHandlers.size > 0) {
      this._onFlagChangeHandlers.forEach((handler) => {
        try {
          handler(event);
        } catch (err) {
          this._logger?.error(err);
        }
      });
    }
  }

  onFlagChange(handler: FlagChangeStrategyOnFlagChangeHandler): FlagChangeStrategyHandlerRef {
    this._onFlagChangeHandlers.add(handler);
    return {
      detach: () => {
        this._onFlagChangeHandlers.delete(handler);
      },
    };
  }

  protected setStatus(status: FlagChangeStrategy['status'], skipNotify?: boolean) {
    if (this._status === status) return;
    this._status = status;
    if (!skipNotify && this._onStatusChangeHandlers.size > 0) {
      this._onStatusChangeHandlers.forEach((handler) => {
        try {
          handler(status);
        } catch (err) {
          this._logger?.error(err);
        }
      });
    }
  }

  onStatusChange(handler: FlagChangeStrategyOnStatusChangeHandler): FlagChangeStrategyHandlerRef {
    this._onStatusChangeHandlers.add(handler);
    return {
      detach: () => {
        this._onStatusChangeHandlers.delete(handler);
      },
    };
  }

  /**
   * reconnect() is using an exponential backoff pattern to try to restart the connection
   * to the websocket.
   */
  async reconnect() {
    let delay = this._options.backoff.minDelayMs;
    let attempts = 0;
    let isCancelled = false;
    this._abortController.signal.addEventListener('abort', () => {
      isCancelled = true;
    });
    do {
      try {
        // check for disposal
        if (this._disposing || isCancelled) return;
        this.connect();
        if (this._status === 'connected') return;
      } catch (err) {
        attempts++;
        this._logger?.error(err);
        this._logger?.warn(
          `${this.name}: error while reconnecting, next try in ${delay} ms (${attempts}/${this._options.maxAttempts}).`,
        );
        await new Promise<void>((resolve) => setTimeout(() => resolve(), delay));
        delay = Math.min(delay * this._options.backoff.multiplier, this._options.backoff.maxDelayMs);
      }
    } while (attempts < this._options.maxAttempts);
  }
}
