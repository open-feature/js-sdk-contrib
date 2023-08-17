import { ClientReadableStream, ClientUnaryCall, ServiceError, credentials, status } from '@grpc/grpc-js';
import {
  EvaluationContext,
  FlagNotFoundError,
  FlagValue,
  GeneralError,
  JsonValue,
  Logger,
  ParseError,
  ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/js-sdk';
import { LRUCache } from 'lru-cache';
import { promisify } from 'util';
import {
  EventStreamResponse,
  ResolveBooleanRequest,
  ResolveBooleanResponse,
  ResolveFloatRequest,
  ResolveFloatResponse,
  ResolveIntRequest,
  ResolveIntResponse,
  ResolveObjectRequest,
  ResolveObjectResponse,
  ResolveStringRequest,
  ResolveStringResponse,
  ServiceClient,
} from '../../../proto/ts/schema/v1/schema';
import { Config } from '../../configuration';
import {
  BASE_EVENT_STREAM_RETRY_BACKOFF_MS,
  DEFAULT_MAX_CACHE_SIZE,
  DEFAULT_MAX_EVENT_STREAM_RETRIES,
  EVENT_CONFIGURATION_CHANGE,
  EVENT_PROVIDER_READY,
} from '../../constants';
import { FlagdProvider } from '../../flagd-provider';
import { Service } from '../service';

type AnyResponse =
  | ResolveBooleanResponse
  | ResolveStringResponse
  | ResolveIntResponse
  | ResolveFloatResponse
  | ResolveObjectResponse;
type AnyRequest =
  | ResolveBooleanRequest
  | ResolveStringRequest
  | ResolveIntRequest
  | ResolveFloatRequest
  | ResolveObjectRequest;

interface FlagChange {
  type: 'delete' | 'write' | 'update';
  source: string;
  flagKey: string;
}

export interface FlagChangeMessage {
  flags?: { [key: string]: FlagChange };
}

// see: https://grpc.github.io/grpc/core/md_doc_statuscodes.html
export const Codes = {
  InvalidArgument: 'INVALID_ARGUMENT',
  NotFound: 'NOT_FOUND',
  DataLoss: 'DATA_LOSS',
  Unavailable: 'UNAVAILABLE',
} as const;

export class GRPCService implements Service {
  private _client: ServiceClient;
  private _cache: LRUCache<string, ResolutionDetails<FlagValue>> | undefined;
  private _cacheEnabled = false;
  private _streamAlive = false;
  private _streamConnectAttempt = 0;
  private _stream: ClientReadableStream<EventStreamResponse> | undefined = undefined;
  private _streamConnectBackoff = BASE_EVENT_STREAM_RETRY_BACKOFF_MS;
  private _maxEventStreamRetries;
  private get _cacheActive() {
    // the cache is "active" (able to be used) if the config enabled it, AND the gRPC stream is live
    return this._cacheEnabled && this._streamAlive;
  }

  constructor(
    config: Config,
    client?: ServiceClient,
    private logger?: Logger,
  ) {
    const { host, port, tls, socketPath } = config;
    this._maxEventStreamRetries = config.maxEventStreamRetries ?? DEFAULT_MAX_EVENT_STREAM_RETRIES;
    this._client = client
      ? client
      : new ServiceClient(
          socketPath ? `unix://${socketPath}` : `${host}:${port}`,
          tls ? credentials.createSsl() : credentials.createInsecure(),
        );

    if (config.cache === 'lru') {
      this._cacheEnabled = true;
      this._cache = new LRUCache({ maxSize: config.maxCacheSize || DEFAULT_MAX_CACHE_SIZE, sizeCalculation: () => 1 });
    }
  }

  connect(
    connectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: () => void,
  ): Promise<void> {
    return this.connectStream(connectCallback, changedCallback, disconnectCallback);
  }

  async disconnect(): Promise<void> {
    // cancel the stream and close the connection
    this._stream?.cancel();
    this._client.close();
  }

  async resolveBoolean(
    flagKey: string,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    return this.resolve(this._client.resolveBoolean, flagKey, context, logger);
  }

  async resolveString(flagKey: string, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<string>> {
    return this.resolve(this._client.resolveString, flagKey, context, logger);
  }

  async resolveNumber(flagKey: string, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<number>> {
    return this.resolve(this._client.resolveFloat, flagKey, context, logger);
  }

  async resolveObject<T extends JsonValue>(
    flagKey: string,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    return this.resolve(this._client.resolveObject, flagKey, context, logger);
  }

  private connectStream(
    connectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: () => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger?.debug(`${FlagdProvider.name}: connecting stream, attempt ${this._streamConnectAttempt}...`);
      const stream = this._client.eventStream({}, {});
      stream.on('error', (err: ServiceError | undefined) => {
        if (err?.code === status.CANCELLED) {
          this.logger?.debug(`${FlagdProvider.name}: stream cancelled, will not be re-established`);
        } else {
          this.handleError(reject, connectCallback, changedCallback, disconnectCallback);
        }
      });
      stream.on('close', () => {
        this.handleClose();
      });
      stream.on('data', (message) => {
        if (message.type === EVENT_PROVIDER_READY) {
          this.handleProviderReady(resolve, connectCallback);
        } else if (message.type === EVENT_CONFIGURATION_CHANGE) {
          this.handleFlagsChanged(message, changedCallback);
        }
      });
      this._stream = stream;
    });
  }

  private handleProviderReady(resolve: () => void, connectCallback: () => void) {
    connectCallback();
    this.logger?.info(`${FlagdProvider.name}: streaming connection established with flagd`);
    this._streamAlive = true;
    this._streamConnectAttempt = 0;
    this._streamConnectBackoff = BASE_EVENT_STREAM_RETRY_BACKOFF_MS;
    resolve();
  }

  private handleFlagsChanged(message: EventStreamResponse, changedCallback: (flagsChanged: string[]) => void) {
    if (message.data) {
      const data = message.data;
      this.logger?.debug(`${FlagdProvider.name}: got message: ${JSON.stringify(data, undefined, 2)}`);
      if (data && typeof data === 'object' && 'flags' in data && data?.['flags']) {
        const flagChangeMessage = data as FlagChangeMessage;
        const flagsChanged: string[] = Object.keys(flagChangeMessage.flags || []);
        // remove each changed key from cache
        flagsChanged.forEach((key) => {
          if (this._cache?.delete(key)) {
            this.logger?.debug(`${FlagdProvider.name}: evicted key: ${key} from cache.`);
          }
        });
        changedCallback(flagsChanged);
      }
    }
  }

  private handleError(
    reject: (reason?: Error) => void,
    connectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: () => void,
  ) {
    disconnectCallback();
    this.logger?.error(`${FlagdProvider.name}: streaming connection error, will attempt reconnect...`);
    this._cache?.clear();
    this._streamAlive = false;

    // if we haven't reached max attempt, reconnect after backoff
    if (this._streamConnectAttempt <= this._maxEventStreamRetries) {
      this._streamConnectAttempt++;
      setTimeout(() => {
        this._streamConnectBackoff = this._streamConnectBackoff * 2;
        this.connectStream(connectCallback, changedCallback, disconnectCallback).catch(() => {
          // empty catch to avoid unhandled promise rejection
        });
      }, this._streamConnectBackoff);
    } else {
      // after max attempts, give up
      const errorMessage = `${FlagdProvider.name}: max stream connect attempts (${this._maxEventStreamRetries} reached)`;
      this.logger?.error(errorMessage);
      reject(new Error(errorMessage));
    }
  }

  private handleClose() {
    this.logger?.info(`${FlagdProvider.name}: streaming connection closed`);
    this._cache?.clear();
    this._streamAlive = false;
  }

  private async resolve<T extends FlagValue>(
    promise: (
      request: AnyRequest,
      callback: (error: ServiceError | null, response: AnyResponse) => void,
    ) => ClientUnaryCall,
    flagKey: string,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    const resolver = promisify(promise);
    if (this._cacheActive) {
      const cached = this._cache?.get(flagKey);
      if (cached) {
        return { ...cached, reason: StandardResolutionReasons.CACHED } as ResolutionDetails<T>;
      }
    }

    // invoke the passed resolver method
    const response = await resolver
      .call(this._client, { flagKey, context })
      .then((resolved) => resolved, this.onRejected);

    const resolved: ResolutionDetails<T>  = {
      value: response.value as T,
      reason: response.reason,
      variant: response.variant,
      flagMetadata: response.metadata,
    };

    logger.debug(
      `${FlagdProvider.name}: resolved flag with key: ${resolved.value}, variant: ${response.variant}, reason: ${response.reason}`,
    );

    if (this._cacheActive && response.reason === StandardResolutionReasons.STATIC) {
      // cache this static value
      this._cache?.set(flagKey, resolved);
    }
    return resolved;
  }

  private onRejected = (err: ServiceError | undefined) => {
    // map the errors
    switch (err?.code) {
      case status.DATA_LOSS:
        throw new ParseError(err.details);
      case status.INVALID_ARGUMENT:
        throw new TypeMismatchError(err.details);
      case status.NOT_FOUND:
        throw new FlagNotFoundError(err.details);
      case status.UNAVAILABLE:
        throw new FlagNotFoundError(err.details);
      default:
        throw new GeneralError(err?.details);
    }
  };
}
