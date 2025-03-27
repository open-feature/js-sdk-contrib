import { ClientOptions, ClientReadableStream, ClientUnaryCall, credentials, ServiceError, status } from '@grpc/grpc-js';
import { ConnectivityState } from '@grpc/grpc-js/build/src/connectivity-state';
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
} from '@openfeature/server-sdk';
import { LRUCache } from 'lru-cache';
import { promisify } from 'node:util';
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
} from '../../../proto/ts/flagd/evaluation/v1/evaluation';
import { Config } from '../../configuration';
import { DEFAULT_MAX_CACHE_SIZE, EVENT_CONFIGURATION_CHANGE, EVENT_PROVIDER_READY } from '../../constants';
import { FlagdProvider } from '../../flagd-provider';
import { Service } from '../service';
import { closeStreamIfDefined } from '../common';

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
  private _eventStream: ClientReadableStream<EventStreamResponse> | undefined = undefined;
  private _deadline: number;

  private get _cacheActive() {
    // the cache is "active" (able to be used) if the config enabled it, AND the gRPC stream is live
    return this._cacheEnabled && this._client.getChannel().getConnectivityState(false) === ConnectivityState.READY;
  }

  constructor(
    config: Config,
    client?: ServiceClient,
    private logger?: Logger,
  ) {
    const { host, port, tls, socketPath, defaultAuthority } = config;
    let clientOptions: ClientOptions | undefined;
    if (defaultAuthority) {
      clientOptions = {
        'grpc.default_authority': defaultAuthority,
      };
    }

    this._client = client
      ? client
      : new ServiceClient(
          socketPath ? `unix://${socketPath}` : `${host}:${port}`,
          tls ? credentials.createSsl() : credentials.createInsecure(),
          clientOptions,
        );
    this._deadline = config.deadlineMs;

    if (config.cache === 'lru') {
      this._cacheEnabled = true;
      this._cache = new LRUCache({ maxSize: config.maxCacheSize || DEFAULT_MAX_CACHE_SIZE, sizeCalculation: () => 1 });
    }
  }

  connect(
    reconnectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: (message: string) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) =>
      this.listen(reconnectCallback, changedCallback, disconnectCallback, resolve, reject),
    );
  }

  async disconnect(): Promise<void> {
    closeStreamIfDefined(this._eventStream);
    this._client.close();
  }

  async resolveBoolean(
    flagKey: string,
    _: boolean,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    return this.resolve(this._client.resolveBoolean, flagKey, context, logger);
  }

  async resolveString(
    flagKey: string,
    _: string,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    return this.resolve(this._client.resolveString, flagKey, context, logger);
  }

  async resolveNumber(
    flagKey: string,
    _: number,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    return this.resolve(this._client.resolveFloat, flagKey, context, logger);
  }

  async resolveObject<T extends JsonValue>(
    flagKey: string,
    _: T,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    return this.resolve(this._client.resolveObject, flagKey, context, logger);
  }

  private listen(
    reconnectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: (message: string) => void,
    resolveConnect?: () => void,
    rejectConnect?: (reason: Error) => void,
  ) {
    this.logger?.debug(`${FlagdProvider.name}: connecting stream...`);

    // close the previous stream if we're reconnecting
    closeStreamIfDefined(this._eventStream);

    const stream = this._client.eventStream({ waitForReady: true}, {});
    stream.on('error', (err: Error) => {
      rejectConnect?.(err);
      this.handleError(reconnectCallback, changedCallback, disconnectCallback);
    });
    stream.on('data', (message) => {
      if (message.type === EVENT_PROVIDER_READY) {
        this.logger?.debug(`${FlagdProvider.name}: streaming connection established with flagd`);
        // if resolveConnect is undefined, this is a reconnection; we only want to fire the reconnect callback in that case
        if (resolveConnect) {
          resolveConnect();
        } else {
          reconnectCallback();
        }
      } else if (message.type === EVENT_CONFIGURATION_CHANGE) {
        this.handleFlagsChanged(message, changedCallback);
      }
    });
    this._eventStream = stream;
  }

  private handleFlagsChanged(message: EventStreamResponse, changedCallback: (flagsChanged: string[]) => void) {
    if (message.data) {
      const data = message.data;
      this.logger?.debug(`${FlagdProvider.name}: got message: ${JSON.stringify(data, undefined, 2)}`);
      if (data && typeof data === 'object' && 'flags' in data && data?.['flags']) {
        const flagChangeMessage = data as FlagChangeMessage;
        const flagsChanged: string[] = Object.keys(flagChangeMessage.flags || []);
        if (this._cacheEnabled) {
          // remove each changed key from cache
          flagsChanged.forEach((key) => {
            if (this._cache?.delete(key)) {
              this.logger?.debug(`${FlagdProvider.name}: evicted key: ${key} from cache.`);
            }
          });
        }
        changedCallback(flagsChanged);
      }
    }
  }

  private reconnect(
    reconnectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: (message: string) => void,
  ) {
    const channel = this._client.getChannel();
    channel.watchConnectivityState(channel.getConnectivityState(true), Infinity, () => {
      this.listen(reconnectCallback, changedCallback, disconnectCallback);
    });
  }

  private handleError(
    reconnectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: (message: string) => void,
  ) {
    disconnectCallback('streaming connection error, will attempt reconnect...');
    this.logger?.error(`${FlagdProvider.name}: streaming connection error, will attempt reconnect...`);
    this._cache?.clear();
    this.reconnect(reconnectCallback, changedCallback, disconnectCallback);
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
      console.log('cache active and this was in the cache', cached);
      if (cached) {
        return { ...cached, reason: StandardResolutionReasons.CACHED } as ResolutionDetails<T>;
      }
    }

    // invoke the passed resolver method
    const response = await resolver
      .call(this._client, { flagKey, context })
      .then((resolved) => resolved, this.onRejected);

    const resolved: ResolutionDetails<T> = {
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
