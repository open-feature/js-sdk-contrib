import type { Logger } from '@openfeature/core';
import type {
  FlagChangeEvent,
  FlagChangeStrategy,
  FlagChangeStrategyHandlerRef,
  FlagChangeStrategyOnFlagChangeHandler,
  FlagChangeStrategyOnStatusChangeHandler,
  FlagChangeStrategyOptions,
} from './model';
import { awaitableTimeout, DeferredPromise, type PromiseOptions } from '../utils';
import { buildOptionsWithDefaults } from './utils';

/**
 * An abstract base class implementing {@link FlagChangeStrategy} interface, containing default implementation of methods
 * This can be extended by any other class (i.e. WebSocket, SSE, etc.)
 */
export abstract class AbstractFlagChangeStrategy<
  TOptions extends FlagChangeStrategyOptions,
> implements FlagChangeStrategy {
  protected static readonly _DEFAULT_CONNECTION_TIMEOUT = 5_000;
  protected readonly _options: TOptions;
  protected _sourceUrl: URL;
  protected readonly _logger?: Logger;
  private _status: FlagChangeStrategy['status'] = 'idle';
  private _disposing = false;
  private _abortController?: AbortController;
  private readonly _onFlagChangeHandlers: Set<FlagChangeStrategyOnFlagChangeHandler>;
  private readonly _onStatusChangeHandlers: Set<FlagChangeStrategyOnStatusChangeHandler>;
  private readonly _onStatusChangeInternalHandlers: Set<FlagChangeStrategyOnStatusChangeHandler>;

  public abstract readonly name: string;

  protected renewSession() {
    this._abortController?.abort();
    return (this._abortController = new AbortController());
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
    this._onStatusChangeInternalHandlers = new Set();
    this._logger = logger;
  }

  connect(): void {
    if (this.disposing || (this.status !== 'idle' && this.status !== 'error')) return;
    this.doConnect().catch((err) => {
      this._logger?.error(`${this.name}: Error while trying to connect`, err);
      this.setStatus('error');
    });
  }

  disconnect(): void {
    // Don't do anything if the instance is already disposing or disconnected
    if (this._disposing || this.status !== 'connected') return;
    this.doDisconnect().catch((err) => {
      this._logger?.error(`${this.name}: Error while trying to disconnect`, err);
      this.setStatus('error');
    });
  }

  /**
   * This method will be called by {@link FlagChangeStrategy.connect()} and needs to be overridden by derived classes.
   * @param signal
   */
  protected abstract onConnect(signal: AbortSignal): Promise<void>;
  /**
   * This method will be called by {@link FlagChangeStrategy.disconnect()} and needs to be overridden by derived classes.
   */
  protected abstract onDisconnect(): Promise<void>;
  /**
   * This method will be called by {@link FlagChangeStrategy.close()} and needs to be overridden by derived classes.
   */
  protected abstract onClose(): Promise<void>;

  close(): void {
    // Check if it's already closed or if it's closing
    if (this.disposing || this.status === 'closed') return;
    this._disposing = true;
    this.doClose().catch((err) => {
      // we revert disposing so that clients can try again to close
      this._disposing = false;
      this._logger?.error(`${this.name}: Error while trying to close`, err);
      this.setStatus('error');
    });
  }

  public waitForStatus(status: FlagChangeStrategy['status'], options?: PromiseOptions, internal?: boolean) {
    return this.waitForAnyStatus([status], options, internal);
  }

  public async waitForAnyStatus(status?: FlagChangeStrategy['status'][], options?: PromiseOptions, internal?: boolean) {
    this._logger?.debug(
      `${this.name}: waitForAnyStatus => status: ${status ? status.join('|') : null}, internal: ${internal}`,
    );
    if (status && status.length > 0 && status.indexOf(this.status) >= 0) return;
    const ref = new DeferredPromise(options);
    const handlerRef = this.onStatusChange((updatedStatus) => {
      if (!status || status.length === 0 || status.indexOf(updatedStatus) >= 0) {
        handlerRef.detach();
        ref.resolve();
      }
    }, internal);
    await ref.promise.catch((err) => {
      handlerRef.detach();
      throw err;
    });
  }

  setApiKey(apiKey: string): void {
    if (this.disposing || this._options.apiKey === apiKey) return;
    this._options.apiKey = apiKey;
    if (this.status === 'connecting' || this.status === 'connected') {
      // let's reconnect
      this.doConnect().catch((err) => {
        this._logger?.error(`${this.name}: Error while trying to reconnect due api key update`, err);
        this.setStatus('error');
      });
    }
  }

  /**
   * Used to notify flag changes to the listeners registered through {@link FlagChangeStrategy.onFlagChange()}
   * @param event
   */
  protected notifyFlagChange(event: FlagChangeEvent) {
    if (!this.disposing && this._onFlagChangeHandlers.size > 0) {
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

  /**
   * Used to notify set and notify the status update to the listeners registered through {@link FlagChangeStrategy.onStatusChange()}
   * @param status
   * @param skipNotify
   */
  protected setStatus(status: FlagChangeStrategy['status'], skipNotify?: boolean) {
    this._status = status;
    // always notify internal handlers
    this._onStatusChangeInternalHandlers.forEach((handler) => handler(status));
    // eventually notify to other handlers
    if (!skipNotify && this._onStatusChangeHandlers.size > 0) {
      this._onStatusChangeHandlers.forEach((handler) => handler(status));
    }
  }

  onStatusChange(handler: FlagChangeStrategyOnStatusChangeHandler, internal?: boolean): FlagChangeStrategyHandlerRef {
    let currentStatus = '';
    const decoratedHandler: FlagChangeStrategyOnStatusChangeHandler = (status) => {
      try {
        this._logger?.debug(
          `${this.name}: Status Handler${internal ? ' (internal)' : ''} => trying to set new status '${status}'`,
        );
        if (currentStatus === status) return;
        this._logger?.debug(
          `${this.name}: Status Handler${internal ? ' (internal)' : ''} => from: ${currentStatus}, to: ${status}`,
        );
        currentStatus = status;
        handler(status);
      } catch (err) {
        this._logger?.error(err);
      }
    };

    if (internal) {
      this._onStatusChangeInternalHandlers.add(decoratedHandler);
      return {
        detach: () => {
          this._onStatusChangeInternalHandlers.delete(decoratedHandler);
        },
      };
    } else {
      this._onStatusChangeHandlers.add(decoratedHandler);
      return {
        detach: () => {
          this._onStatusChangeHandlers.delete(decoratedHandler);
        },
      };
    }
  }

  /**
   * doConnect() will make all the actions to properly connect the change strategy to the source,
   * using an exponential backoff pattern to try to restart the connection if needed.
   */
  protected async doConnect() {
    // initialize retry variables
    let delay = this._options.backoff.minDelayMs;
    let attempts = 0;
    let err: any = undefined;
    // renew the session
    const sessionAbort = this.renewSession();
    // start the loop
    do {
      this.setStatus('connecting');
      // execute the onConnect() handler
      err = await this.onConnect(sessionAbort.signal)
        // we wait for one of the statuses
        .then(() => this.waitForAnyStatus(['connected', 'error', 'closed'], { signal: sessionAbort.signal }, true))
        // We catch any error that can happen from onConnect() and waitForAnyStatus()
        .catch((err) => err);
      // stop the execution if the session ended or if we are not in error
      this._logger?.debug(
        `${this.name}: result from onConnect => aborted: ${sessionAbort.signal.aborted}, status: ${this.status}`,
      );
      if (sessionAbort.signal.aborted || (this.status === 'connected' && !err)) return;
      // here we should be in error state, let's check for max connection attempts
      if (attempts >= this._options.maxAttempts) break;
      // let's retry with the backoff
      attempts++;
      this._logger?.error(
        `${this.name}: error while reconnecting, next try in ${delay} ms (${attempts}/${this._options.maxAttempts}).`,
        err,
      );
      await awaitableTimeout(delay, { signal: sessionAbort.signal }).catch((err) => undefined);
      // let's re-check for cancellation after the timeout, stop execution if session ended
      if (sessionAbort.signal.aborted) return;
      // if we are here, it means we have to continue the retry loop
      // let's calculate the backoff delay
      delay = Math.min(delay * this._options.backoff.multiplier, this._options.backoff.maxDelayMs);
    } while (attempts <= this._options.maxAttempts);
    // NOTE: if we are here, all the attemps ended and for now we set the state in error
    // in the future this may change if we think is better to leave untouched the status
    this._logger?.error(`${this.name}: cannot reconnect, max retries reached`);
    this.setStatus('error');
  }

  /**
   * doDisconnect() will make all the actions to properly disconnect the change strategy from the source
   */
  protected async doDisconnect() {
    this.setStatus('disconnecting');
    // renew the session
    const sessionAbort = this._abortController;
    try {
      // execute the onDisconnect() handler
      const err = await this.onDisconnect()
        // we wait for one of the statuses
        .then(() => this.waitForAnyStatus(['idle', 'error', 'closed'], { signal: sessionAbort?.signal }, true))
        // We catch any error that can happen from onDisconnect() and waitForAnyStatus()
        .catch((err) => err);
      // stop the execution if the session ended or if we are not in error
      if (sessionAbort?.signal.aborted || (this.status === 'idle' && !err)) return;
      // NOTE: if we are here, we are in error and for now we set an failed state,
      // in the future this may change if we think is better to leave untouched the status
      this._logger?.error(`${this.name}: error while disconnecting`, err);
      this.setStatus('error');
    } finally {
      // some clean-up
      sessionAbort?.abort();
    }
  }

  /**
   * doClose() will make all the actions to close properly the change strategy.
   */
  protected async doClose() {
    this.setStatus('closing');
    // execute onClose() handler
    await this.onClose();
    // we can make some clean-up
    this._abortController?.abort();
    this._abortController = undefined;
    // we can set the status to closed
    this.setStatus('closed');
  }
}
