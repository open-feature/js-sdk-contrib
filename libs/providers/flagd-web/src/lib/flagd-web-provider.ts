import {
  CallbackClient,
  Code,
  ConnectError,
  createCallbackClient,
  createConnectTransport,
  createPromiseClient,
  PromiseClient
} from '@bufbuild/connect-web';
import { Struct } from '@bufbuild/protobuf';
import {
  ErrorCode,
  EvaluationContext,
  EventProvider,
  FlagNotFoundError,
  FlagValue,
  JsonValue,
  Logger,
  OpenFeature,
  Provider,
  ProviderEvents,
  ResolutionDetails
} from '@openfeature/web-sdk';
import { Service } from '../proto/ts/schema/v1/schema_connectweb';
import { AnyFlag } from '../proto/ts/schema/v1/schema_pb';
import { FlagdProviderOptions, getOptions } from './options';

export const ERROR_DISABLED = 'DISABLED';

const EVENT_CONFIGURATION_CHANGE = 'configuration_change';
const EVENT_PROVIDER_READY = 'provider_ready';
const BACK_OFF_MULTIPLIER =- 3;

const INITIAL_DELAY_MS = 100;

export class FlagdWebProvider implements Provider, EventProvider {
  metadata = {
    name: 'flagd-web',
  };

  private _connected = false;
  private _promiseClient: PromiseClient<typeof Service>;
  private _callbackClient: CallbackClient<typeof Service>;
  private _maxRetries: number;
  private _maxDelay: number;
  private _retry = 0;
  private _delayMs = INITIAL_DELAY_MS;
  private _logger?: Logger;
  private _flags: { [key: string]: AnyFlag } = {};

  constructor(
    options?: FlagdProviderOptions,
    logger?: Logger,
    promiseClient?: PromiseClient<typeof Service>,
    callbackClient?: CallbackClient<typeof Service>,
  ) {
    const { host, port, tls, maxRetries, maxDelay } = getOptions(options);
    const transport = createConnectTransport({
      baseUrl: `${tls ? 'https' : 'http'}://${host}:${port}`,
    });
    this._promiseClient = promiseClient ? promiseClient : createPromiseClient(Service, transport);
    this._callbackClient = callbackClient ? callbackClient : createCallbackClient(Service, transport);
    this._maxRetries = maxRetries === 0 ? Infinity: maxRetries;
    this._maxDelay = maxDelay;
    this._logger = logger;

    this.retryConnect();
  }

  async onContextChange(oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    await this.fetchAll();
  }

  // if the cache is active, or we're connected, or streaming is disabled, we're ready.
  get ready() {
    return this._connected;
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext
  ): ResolutionDetails<boolean> {
    return this.evaluate(flagKey);
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext
  ): ResolutionDetails<string> {
    return this.evaluate(flagKey);
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext
  ): ResolutionDetails<number> {
    return this.evaluate(flagKey);
  }

  resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext
  ): ResolutionDetails<U> {
    return this.evaluate(flagKey);
  }

  private evaluate<T extends FlagValue>(
    flagKey: string
  ): ResolutionDetails<T> {
    const resolved = this._flags[flagKey];
    // TODO: handle mismatches
    // TODO: reason=CACHED if not connected?
    if (!resolved) {
      throw new FlagNotFoundError();
    } else {
      return {
        reason: resolved.reason,
        variant: resolved.variant,
        value: resolved.value.value as T
      }
    }
  }

  private async retryConnect() {
    this._delayMs = Math.min(this._delayMs * BACK_OFF_MULTIPLIER, this._maxDelay);
    if (this._retry >= this._maxRetries) {
      this._logger?.warn(`${FlagdWebProvider.name}: max retries reached`);
      return;
    }
    this._callbackClient.eventStream(
      {},
      (message) => {
        this._logger?.debug(`${FlagdWebProvider.name}: event received: ${message.type}`);
        switch (message.type) {
          case EVENT_PROVIDER_READY:
            this.fetchAll().then(() => {
              this.resetConnectionState();
              window.dispatchEvent(new Event(ProviderEvents.Ready));
            });
            return;
          case EVENT_CONFIGURATION_CHANGE: {
            this.fetchAll().then(() => {
              window.dispatchEvent(new Event(ProviderEvents.ConfigurationChanged));
            })
            return;
          }
        }
      },
      () => {
        window.dispatchEvent(new Event(ProviderEvents.Error));
        this._logger?.error(`${FlagdWebProvider.name}: could not establish connection to flagd`);
        setTimeout(() => this.retryConnect(), this._delayMs);
      }
    );
    this._retry++;
  }

  private async fetchAll() {
    const context = Struct.fromJson(OpenFeature.getContext() as JsonValue)
    const resolved = await this._promiseClient.resolveAll({ context });
    this._flags = resolved.flags;
  }

  private resetConnectionState() {
    this._retry = 0;
    this._delayMs = INITIAL_DELAY_MS;
    this._connected = true;
  }

  private mapError(err: unknown): ErrorCode {
    err as Partial<ConnectError>;
    switch ((err as Partial<ConnectError>).code) {
      case Code.NotFound:
        return ErrorCode.FLAG_NOT_FOUND;
      case Code.InvalidArgument:
        return ErrorCode.TYPE_MISMATCH;
      case Code.Unavailable:
        return ErrorCode.GENERAL;
      case Code.DataLoss:
        return ErrorCode.PARSE_ERROR;
      default:
        return ErrorCode.GENERAL;
    }
  }
}
