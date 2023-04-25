import * as grpc from '@grpc/grpc-js';
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
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type { JsonValue as PbJsonValue } from '@protobuf-ts/runtime';
import type { UnaryCall } from '@protobuf-ts/runtime-rpc';
import { RpcError } from '@protobuf-ts/runtime-rpc';
import LRU from 'lru-cache';
import { Struct } from '../../../proto/ts/google/protobuf/struct';
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
} from '../../../proto/ts/schema/v1/schema';
import { ServiceClient } from '../../../proto/ts/schema/v1/schema.client';
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
  private _cache: LRU<string, ResolutionDetails<FlagValue>> | undefined;
  private _cacheEnabled = false;
  private _streamAlive = false;
  private _streamConnectAttempt = 0;
  private _streamConnectBackoff = BASE_EVENT_STREAM_RETRY_BACKOFF_MS;
  private _maxEventStreamRetries;
  private get _cacheActive() {
    // the cache is "active" (able to be used) if the config enabled it, AND the gRPC stream is live
    return this._cacheEnabled && this._streamAlive;
  }

  // default to false here - reassigned in the constructor if we actaully need to connect
  readonly streamConnection = Promise.resolve(false);

  constructor(config: Config, client?: ServiceClient, private logger?: Logger) {
    const { host, port, tls, socketPath } = config;
    this._maxEventStreamRetries = config.maxEventStreamRetries ?? DEFAULT_MAX_EVENT_STREAM_RETRIES;
    this._client = client
      ? client
      : new ServiceClient(
          new GrpcTransport({
            host: socketPath ? `unix://${socketPath}` : `${host}:${port}`,
            channelCredentials: tls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure(),
          })
        );

    // for now, we only need streaming if the cache is enabled (will need to be pulled out once we support events)
    if (config.cache === 'lru') {
      this._cacheEnabled = true;
      this._cache = new LRU({ maxSize: config.maxCacheSize || DEFAULT_MAX_CACHE_SIZE, sizeCalculation: () => 1 });
      this.streamConnection = this.connectStream();
    }
  }

  async resolveBoolean(
    flagKey: string,
    context: EvaluationContext,
    logger: Logger
  ): Promise<ResolutionDetails<boolean>> {
    return this.resolve(this._client.resolveBoolean, flagKey, context, logger, this.booleanParser);
  }

  async resolveString(flagKey: string, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<string>> {
    return this.resolve(this._client.resolveString, flagKey, context, logger, this.stringParser);
  }

  async resolveNumber(flagKey: string, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<number>> {
    return this.resolve(this._client.resolveFloat, flagKey, context, logger, this.numberParser);
  }

  async resolveObject<T extends JsonValue>(
    flagKey: string,
    context: EvaluationContext,
    logger: Logger
  ): Promise<ResolutionDetails<T>> {
    return this.resolve(this._client.resolveObject, flagKey, context, logger, this.objectParser);
  }

  private connectStream(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.logger?.debug(`${FlagdProvider.name}: connecting stream, attempt ${this._streamConnectAttempt}...`);
      const stream = this._client.eventStream({});
      stream.responses.onError(() => {
        this.handleError(reject);
      });
      stream.responses.onComplete(() => {
        this.handleComplete();
      });
      stream.responses.onMessage((message) => {
        if (message.type === EVENT_PROVIDER_READY) {
          this.handleProviderReady(resolve);
        } else if (message.type === EVENT_CONFIGURATION_CHANGE) {
          this.handleFlagsChanged(message);
        }
      });
    });
  }

  private handleProviderReady(resolve: (value: boolean | PromiseLike<boolean>) => void) {
    this.logger?.info(`${FlagdProvider.name}: streaming connection established with flagd`);
    this._streamAlive = true;
    this._streamConnectAttempt = 0;
    this._streamConnectBackoff = BASE_EVENT_STREAM_RETRY_BACKOFF_MS;
    resolve(true);
  }

  private handleFlagsChanged(message: EventStreamResponse) {
    if (message.data) {
      const data = Struct.toJson(message.data);
      this.logger?.debug(`${FlagdProvider.name}: got message: ${JSON.stringify(data, undefined, 2)}`);
      if (data && typeof data === 'object' && 'flags' in data && data?.['flags']) {
        const flagChangeMessage = data as FlagChangeMessage;
        // remove each changed key from cache
        Object.keys(flagChangeMessage.flags || []).forEach((key) => {
          if (this._cache?.delete(key)) {
            this.logger?.debug(`${FlagdProvider.name}: evicted key: ${key} from cache.`);
          }
        });
      }
    }
  }

  private handleError(reject: (reason?: any) => void) {
    this.logger?.error(`${FlagdProvider.name}: streaming connection error, will attempt reconnect...`);
    this._cache?.clear();
    this._streamAlive = false;

    // if we haven't reached max attempt, reconnect after backoff
    if (this._streamConnectAttempt <= this._maxEventStreamRetries) {
      this._streamConnectAttempt++;
      setTimeout(() => {
        this._streamConnectBackoff = this._streamConnectBackoff * 2;
        this.connectStream();
      }, this._streamConnectBackoff);
    } else {
      // after max attempts, give up
      const errorMessage = `${FlagdProvider.name}: max stream connect attempts (${this._maxEventStreamRetries} reached)`;
      this.logger?.error(errorMessage);
      reject(new Error(errorMessage));
    }
  }

  private handleComplete() {
    this.logger?.info(`${FlagdProvider.name}: streaming connection closed gracefully`);
    this._cache?.clear();
    this._streamAlive = false;
  }

  private objectParser = (struct: Struct) => {
    if (struct) {
      return Struct.toJson(struct);
    }
    return {}
  };

  private booleanParser = (value: boolean) => {
    if (value) {
      return value;
    }
    return false
  };

  private stringParser = (value: string) => {
    if (value) {
      return value;
    }
    return ''
  };

  private numberParser = (value: number) => {
    if (value) {
      return value;
    }
    return 0
  };

  private async resolve<T extends FlagValue, Rq extends AnyRequest, Rs extends AnyResponse>(
    resolver: (request: AnyRequest) => UnaryCall<Rq, Rs>,
    flagKey: string,
    context: EvaluationContext,
    logger: Logger,
    parser?: (value: any) => any
  ): Promise<ResolutionDetails<T>> {
    if (this._cacheActive) {
      const cached = this._cache?.get(flagKey);
      if (cached) {
        return { ...cached, reason: StandardResolutionReasons.CACHED } as ResolutionDetails<T>;
      }
    }

    // invoke the passed resolver method
    const { response } = await resolver
      .call(this._client, { flagKey, context: this.convertContext(context, logger) })
      .then((resolved) => resolved, this.onRejected);

    const resolved = {
      // invoke the parser method if passed
      value: parser ? parser.call(this, response.value) : response.value,
      reason: response.reason,
      variant: response.variant,
    } as ResolutionDetails<T>;

    if (this._cacheActive && response.reason === StandardResolutionReasons.STATIC) {
      // cache this static value
      this._cache?.set(flagKey, { ...resolved });
    }
    return resolved;
  }

  private convertContext(context: EvaluationContext, logger: Logger): Struct {
    try {
      // stringify to remove invalid js props
      return Struct.fromJsonString(JSON.stringify(context));
    } catch (e) {
      const message = 'Error serializing context.';
      const error = e as Error;
      logger.error(`${message}: ${error?.message}`);
      logger.error(error?.stack);
      throw new ParseError(message);
    }
  }

  private onRejected = (err: RpcError) => {
    // map the errors
    switch (err?.code) {
      case Codes.DataLoss:
        throw new ParseError(err.message);
      case Codes.InvalidArgument:
        throw new TypeMismatchError(err.message);
      case Codes.NotFound:
        throw new FlagNotFoundError(err.message);
      case Codes.Unavailable:
        throw new FlagNotFoundError(err.message);
      default:
        throw new GeneralError(err.message);
    }
  };
}
