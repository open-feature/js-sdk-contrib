import { type ClientReadableStream, type ClientUnaryCall, type ServiceError } from '@grpc/grpc-js';
import { status } from '@grpc/grpc-js';
import { ConnectivityState } from '@grpc/grpc-js/build/src/connectivity-state';
import type { EvaluationContext, FlagValue, JsonValue, Logger, ResolutionDetails } from '@openfeature/server-sdk';
import {
  FlagNotFoundError,
  GeneralError,
  ParseError,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/server-sdk';
import { LRUCache } from 'lru-cache';
import { promisify } from 'node:util';

import type {
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
} from '../../../proto/ts/flagd/evaluation/v2/evaluation';
import { ServiceClient } from '../../../proto/ts/flagd/evaluation/v2/evaluation';
import type { FlagdGrpcConfig } from '../../configuration';
import {
  DEFAULT_MAX_BACKOFF_MS,
  DEFAULT_MAX_CACHE_SIZE,
  EVENT_CONFIGURATION_CHANGE,
  EVENT_PROVIDER_READY,
} from '../../constants';
import { FlagdProvider } from '../../flagd-provider';
import type { Service } from '../service';
import {
  buildClientOptions,
  closeStreamIfDefined,
  createChannelCredentials,
  createFatalStatusCodesSet,
  handleFatalStatusCodeError,
  isFatalStatusCodeError,
} from '../common';

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
  private readonly _fatalStatusCodes: Set<number>;
  private _initialized = false;
  private _streamDeadline: number;
  private _maxBackoffMs: number;
  private _errorThrottled = false;

  private get _cacheActive() {
    // the cache is "active" (able to be used) if the config enabled it, AND the gRPC stream is live
    return this._cacheEnabled && this._client.getChannel().getConnectivityState(false) === ConnectivityState.READY;
  }

  constructor(
    config: FlagdGrpcConfig,
    client?: ServiceClient,
    private logger?: Logger,
  ) {
    const { host, port, tls, socketPath, certPath } = config;
    const clientOptions = buildClientOptions(config);
    const channelCredentials = createChannelCredentials(tls, certPath);

    this._maxBackoffMs = config.retryBackoffMaxMs || DEFAULT_MAX_BACKOFF_MS;
    this._client = client
      ? client
      : new ServiceClient(socketPath ? `unix://${socketPath}` : `${host}:${port}`, channelCredentials, clientOptions);
    this._deadline = config.deadlineMs;
    this._streamDeadline = config.streamDeadlineMs;

    if (config.cache === 'lru') {
      this._cacheEnabled = true;
      this._cache = new LRUCache({ maxSize: config.maxCacheSize || DEFAULT_MAX_CACHE_SIZE, sizeCalculation: () => 1 });
    }

    this._fatalStatusCodes = createFatalStatusCodesSet(config.fatalStatusCodes, logger);
  }

  clearCache(): void {
    this._cache?.clear();
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

    // wait for connection to be stable
    this._client.waitForReady(Date.now() + this._deadline, (err) => {
      if (err) {
        // Check if error is a fatal status code on first connection only
        if (isFatalStatusCodeError(err, this._initialized, this._fatalStatusCodes)) {
          handleFatalStatusCodeError(err, this.logger, disconnectCallback, rejectConnect);
          return;
        }
        rejectConnect?.(err);
        this.handleError(reconnectCallback, changedCallback, disconnectCallback);
      } else {
        const streamDeadline = this._streamDeadline != 0 ? Date.now() + this._streamDeadline : undefined;
        const stream = this._client.eventStream({}, { deadline: streamDeadline });
        stream.on('error', (err: Error) => {
          // In cases where we get an explicit error status, we add a delay.
          // This prevents tight loops when errors are returned immediately, typically by intervening proxies like Envoy.
          this._errorThrottled = true;
          // Check if error is a fatal status code on first connection only
          if (isFatalStatusCodeError(err, this._initialized, this._fatalStatusCodes)) {
            handleFatalStatusCodeError(err, this.logger, disconnectCallback, rejectConnect);
            return;
          }
          rejectConnect?.(err);
          this.handleError(reconnectCallback, changedCallback, disconnectCallback);
        });
        stream.on('data', (message) => {
          if (message.type === EVENT_PROVIDER_READY) {
            this.logger?.debug(`${FlagdProvider.name}: streaming connection established with flagd`);
            this._initialized = true;
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
    });
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
    setTimeout(
      () => this.listen(reconnectCallback, changedCallback, disconnectCallback),
      this._errorThrottled ? this._maxBackoffMs : 0,
    );
    this._errorThrottled = false;
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
