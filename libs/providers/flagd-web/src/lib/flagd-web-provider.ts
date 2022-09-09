import {
  CallbackClient,
  CallOptions,
  Code,
  ConnectError,
  createCallbackClient,
  createConnectTransport,
  createPromiseClient,
  PromiseClient,
} from '@bufbuild/connect-web';
import { PartialMessage, Struct } from '@bufbuild/protobuf';
import {
  ErrorCode,
  EvaluationContext,
  EventProvider,
  FlagValue,
  JsonValue,
  Logger,
  Provider,
  ProviderEvents,
  ResolutionDetails,
  StandardResolutionReasons,
} from '@openfeature/js-sdk';
import { EventEmitter } from 'events';
import { Service } from '../proto/ts/schema/v1/schema_connectweb';
import {
  EventStreamResponse,
  ResolveBooleanRequest,
  ResolveBooleanResponse,
  ResolveFloatRequest,
  ResolveFloatResponse,
  ResolveObjectRequest,
  ResolveObjectResponse,
  ResolveStringRequest,
  ResolveStringResponse,
} from '../proto/ts/schema/v1/schema_pb';
import { FlagdProviderOptions, getOptions } from './options';
import { FlagdCache } from './flagd-cache';
import { LocalStorageFlagdCache } from './local-storage-flagd-cache';

export const ERROR_DISABLED = 'DISABLED';

const EVENT_CONFIGURATION_CHANGE = 'configuration_change';
const EVENT_PROVIDER_READY = 'provider_ready';
const BACK_OFF_MULTIPLIER =- 3;

interface ConfigurationChangeBody {
  type: 'delete' | 'write' | 'update';
  source: string;
  flagKey: string;
}

type ResolveAnyRequest = ResolveStringRequest | ResolveFloatRequest | ResolveBooleanRequest | ResolveObjectRequest;
type ResolveAnyResponse = ResolveBooleanResponse | ResolveStringResponse | ResolveFloatResponse | ResolveObjectResponse;

const INITIAL_DELAY_MS = 100;

export class FlagdWebProvider implements Provider, EventProvider {
  metadata = {
    name: 'flagd-web',
  };

  events = new EventEmitter();

  private _connected = false;
  private _promiseClient: PromiseClient<typeof Service>;
  private _callbackClient: CallbackClient<typeof Service>;
  private _maxRetries: number;
  private _maxDelay: number;
  private _cache: FlagdCache;
  private _cacheEnabled: boolean;
  private _retry = 0;
  private _delayMs = INITIAL_DELAY_MS;
  private _streamingEnabled: boolean;
  private _logger?: Logger;

  constructor(
    options?: FlagdProviderOptions,
    logger?: Logger,
    cache?: FlagdCache,
    promiseClient?: PromiseClient<typeof Service>,
    callbackClient?: CallbackClient<typeof Service>,
  ) {
    const { host, port, tls, caching, cacheTtl, maxRetries, maxDelay, eventStreaming } = getOptions(options);
    const transport = createConnectTransport({
      baseUrl: `${tls ? 'https' : 'http'}://${host}:${port}`,
    });
    this._promiseClient = promiseClient ? promiseClient : createPromiseClient(Service, transport);
    this._callbackClient = callbackClient ? callbackClient : createCallbackClient(Service, transport);
    this._cache = cache ? cache : new LocalStorageFlagdCache({ itemTtl: cacheTtl }, logger);
    this._maxRetries = maxRetries === 0 ? Infinity: maxRetries;
    this._maxDelay = maxDelay;
    this._streamingEnabled = eventStreaming;
    this._cacheEnabled = caching;
    this._logger = logger;

    if (this._streamingEnabled) {
      this.retryConnect();
    } else {
      this._connected = true;
    }
  }

  // if the cache is active, or we're connected, or streaming is disabled, we're ready.
  get ready() {
    return this._connected || this._cacheEnabled || !this._streamingEnabled;
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    return this.evaluate(flagKey, defaultValue, context, this._promiseClient.resolveBoolean);
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    return this.evaluate(flagKey, defaultValue, context, this._promiseClient.resolveString);
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    return this.evaluate(flagKey, defaultValue, context, this._promiseClient.resolveFloat);
  }

  resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext
  ): Promise<ResolutionDetails<U>> {
    return this.evaluate(flagKey, defaultValue, context, this._promiseClient.resolveObject);
  }

  private async evaluate<T extends FlagValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    resolver: (
      request: PartialMessage<ResolveAnyRequest>,
      options?: CallOptions | undefined
    ) => Promise<ResolveAnyResponse>
  ): Promise<ResolutionDetails<T>> {
    try {
       
      if (this._cacheEnabled) {
        const cachedResult = await this._cache.get<T>(flagKey, context);
        if (cachedResult) {
          return cachedResult;
        }
      }
      const result = await resolver({flagKey, context: Struct.fromJson(context as JsonValue)});
      const details = {
        // if this is a Struct (object resolution), parse it
        value: (result.value && result.value instanceof Struct ? result.value.toJson() : result.value) as unknown as T,
        reason: result.reason,
        variant: result.variant,
      };
      if (this._cacheEnabled) {
        this._cache.set(flagKey, context, details).catch(() => {
          this._logger?.error(`unable to persist cached value for ${flagKey}`);
        });
      }
      return details;
    } catch (err) {
      return {
        reason: StandardResolutionReasons.ERROR,
        errorCode: this.mapError(err),
        value: defaultValue,
      };
    }
  }

  private updateCacheForFlagKey(message: EventStreamResponse) {
    try {
      if (message.data) {
        const body = message.data.toJson() as unknown as ConfigurationChangeBody;
        this._cache.flush(body.flagKey).then(() => {
          this._logger?.debug(
            `${FlagdWebProvider.name}: configuration change: ${body.type} ${body.flagKey} ${body.source}, associated cache items busted`
          );
        });
      }
    } catch (err) {
      this._logger?.warn(`error updating cache`);
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
            this.resetConnectionState();
            this.events.emit(ProviderEvents.Ready);
            return;
          case EVENT_CONFIGURATION_CHANGE: {
            this.updateCacheForFlagKey(message);
            this.events.emit(ProviderEvents.ConfigurationChanged);
          }
        }
      },
      () => {
        this.events.emit(ProviderEvents.Error);
        this._logger?.error(`${FlagdWebProvider.name}: could not establish connection to flagd`);
        setTimeout(() => this.retryConnect(), this._delayMs);
      }
    );
    this._retry++;
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
