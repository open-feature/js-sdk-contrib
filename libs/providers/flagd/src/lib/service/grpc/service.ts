import * as grpc from '@grpc/grpc-js';
import {
  EvaluationContext,
  FlagNotFoundError,
  GeneralError,
  JsonValue,
  Logger,
  ParseError,
  ResolutionDetails,
  TypeMismatchError
} from '@openfeature/js-sdk';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { FinishedUnaryCall, RpcError } from '@protobuf-ts/runtime-rpc';
import { Struct } from '../../../proto/ts/google/protobuf/struct';
import { ServiceClient } from '../../../proto/ts/schema/v1/schema.client';
import { Config } from '../../configuration';
import { Service } from '../service';

// see: https://grpc.github.io/grpc/core/md_doc_statuscodes.html
export const Codes = {
  InvalidArgument: 'INVALID_ARGUMENT',
  NotFound: 'NOT_FOUND',
  DataLoss: 'DATA_LOSS',
  Unavailable: 'UNAVAILABLE'
} as const;

export class GRPCService implements Service {
  client: ServiceClient;

  constructor(config: Config, client?: ServiceClient) {
    const { host, port, tls, socketPath } = config;
    this.client = client
      ? client
      : new ServiceClient(
          new GrpcTransport({
            host: socketPath ? `unix://${socketPath}` : `${host}:${port}`,
            channelCredentials: tls
              ? grpc.credentials.createSsl()
              : grpc.credentials.createInsecure(),
          })
        );
  }

  async resolveBoolean(
    flagKey: string,
    context: EvaluationContext,
    logger: Logger
  ): Promise<ResolutionDetails<boolean>> {
    const { response } = await this.client.resolveBoolean({
      flagKey,
      context: this.convertContext(context, logger),
    }).then(this.onFulfilled, this.onRejected);;
    return {
      value: response.value,
      reason: response.reason,
      variant: response.variant,
    };
  }

  async resolveString(
    flagKey: string,
    context: EvaluationContext,
    logger: Logger
  ): Promise<ResolutionDetails<string>> {
    const { response } = await this.client.resolveString({
      flagKey,
      context: this.convertContext(context, logger),
    }).then(this.onFulfilled, this.onRejected);
    return {
      value: response.value,
      reason: response.reason,
      variant: response.variant,
    }
  }

  async resolveNumber(
    flagKey: string,
    context: EvaluationContext,
    logger: Logger
  ): Promise<ResolutionDetails<number>> {
    const { response } = await this.client.resolveFloat({
      flagKey,
      context: this.convertContext(context, logger),
    }).then(this.onFulfilled, this.onRejected);
    return {
      value: response.value,
      reason: response.reason,
      variant: response.variant,
    };
  }

  async resolveObject<T extends JsonValue>(
    flagKey: string,
    context: EvaluationContext,
    logger: Logger
  ): Promise<ResolutionDetails<T>> {
    const { response } = await this.client.resolveObject({
      flagKey,
      context: this.convertContext(context, logger),
    }).then(this.onFulfilled, this.onRejected);
    if (response.value !== undefined) {
      return {
        value: Struct.toJson(response.value) as T,
        reason: response.reason,
        variant: response.variant,
      };
    } else {
      throw new ParseError('Object value undefined or missing.');
    }
  }

  private convertContext(context: EvaluationContext, logger: Logger): Struct {
    try {
      // stringify to remove invalid js props
      return Struct.fromJsonString(JSON.stringify(context));
    } catch (e) {
      const message = 'Error serializing context.';
      const error = e as Error;
      logger.error(`${message}: ${error?.message}`);
      logger.error(error?.stack)
      throw new ParseError(message);
    }
  }

  private onFulfilled = <T extends object, U extends object>(value: FinishedUnaryCall<T, U>) => {
    // no-op, just return the value
    return value;
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
  }
}
