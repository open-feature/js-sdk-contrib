import * as grpc from '@grpc/grpc-js';
import {
  EvaluationContext,
  JsonValue,
  ParseError,
  ResolutionDetails,
} from '@openfeature/js-sdk';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { JsonObject } from '@protobuf-ts/runtime';
import { Struct } from '../../../proto/ts/google/protobuf/struct';
import { ServiceClient } from '../../../proto/ts/schema/v1/schema.client';
import { Service } from '../service';
import { Protocol } from './protocol';

interface GRPCServiceOptions {
  host: string;
  port: number;
  protocol: Protocol;
  socketPath?: string;
}

export class GRPCService implements Service {
  client: ServiceClient;

  constructor(options: GRPCServiceOptions, client?: ServiceClient) {
    const { host, port, protocol, socketPath } = options;
    this.client = client
      ? client
      : new ServiceClient(
          new GrpcTransport({
            host: socketPath ? `unix://${socketPath}` : `${host}:${port}`,
            channelCredentials:
              protocol === 'http'
                ? grpc.credentials.createInsecure()
                : grpc.credentials.createSsl(),
          })
        );
  }

  async resolveBoolean(
    flagKey: string,
    context: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    const { response } = await this.client.resolveBoolean({
      flagKey,
      context: this.convertContext(context),
    });
    return {
      value: response.value,
      reason: response.reason,
      variant: response.variant,
    };
  }

  async resolveString(
    flagKey: string,
    context: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    const { response } = await this.client.resolveString({
      flagKey,
      context: this.convertContext(context),
    });
    return {
      value: response.value,
      reason: response.reason,
      variant: response.variant,
    };
  }

  async resolveNumber(
    flagKey: string,
    context: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    const { response } = await this.client.resolveFloat({
      flagKey,
      context: this.convertContext(context),
    });
    return {
      value: response.value,
      reason: response.reason,
      variant: response.variant,
    };
  }

  async resolveObject<T extends JsonValue>(
    flagKey: string,
    context: EvaluationContext
  ): Promise<ResolutionDetails<T>> {
    const { response } = await this.client.resolveObject({
      flagKey,
      context: this.convertContext(context),
    });
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

  private convertContext(context: EvaluationContext): Struct {
    // JsonObject closely matches EvaluationContext, this is a safe cast.
    try {
      return Struct.fromJson(context as JsonObject);
    } catch (e) {
      throw new ParseError(`Error serializing context.`);
    }
  }
}
