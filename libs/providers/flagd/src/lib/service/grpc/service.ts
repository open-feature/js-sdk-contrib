import { RpcError } from '@protobuf-ts/runtime-rpc';
import { JsonValue } from '@protobuf-ts/runtime';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import * as grpc from '@grpc/grpc-js';
import {
  EvaluationContext,
  ResolutionDetails,
  StandardResolutionReasons,
} from '@openfeature/nodejs-sdk';
import { Struct } from '../../../proto/ts/google/protobuf/struct';
import { ServiceClient } from '../../../proto/ts/schema/v1/schema.client';
import { Service } from '../service';
import { Protocol } from './protocol';

interface GRPCServiceOptions {
  host: string;
  port: number;
  protocol: Protocol
}

export class GRPCService implements Service {
  client: ServiceClient;

  constructor(options: GRPCServiceOptions, client?: ServiceClient) {
    const { host, port, protocol } = options;
    this.client = client ? client : new ServiceClient(
      new GrpcTransport({
        host: `${host}:${port}`,
        channelCredentials: protocol === 'http' ? grpc.credentials.createInsecure() : grpc.credentials.createSsl()
      })
    );
  }

  async resolveBoolean(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    try {
      const { response } = await this.client.resolveBoolean({
        flagKey,
        context: this.convertContext(context),
      });
      return {
        value: response.value,
        reason: response.reason,
        variant: response.variant,
      };
    } catch (err: unknown) {
      return {
        reason: StandardResolutionReasons.ERROR,
        errorCode:
          (err as Partial<RpcError>)?.code ?? StandardResolutionReasons.UNKNOWN,
        value: defaultValue,
      };
    }
  }

  async resolveString(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    try {
      const { response } = await this.client.resolveString({
        flagKey,
        context: this.convertContext(context),
      });
      return {
        value: response.value,
        reason: response.reason,
        variant: response.variant,
      };
    } catch (err: unknown) {
      return {
        reason: StandardResolutionReasons.ERROR,
        errorCode:
          (err as Partial<RpcError>)?.code ?? StandardResolutionReasons.UNKNOWN,
        value: defaultValue,
      };
    }
  }

  async resolveNumber(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    try {
      const { response } = await this.client.resolveFloat({
        flagKey,
        context: this.convertContext(context),
      });
      return {
        value: response.value,
        reason: response.reason,
        variant: response.variant,
      };
    } catch (err: unknown) {
      return {
        reason: StandardResolutionReasons.ERROR,
        errorCode:
          (err as Partial<RpcError>)?.code ?? StandardResolutionReasons.UNKNOWN,
        value: defaultValue,
      };
    }
  }

  async resolveObject<T extends object>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext
  ): Promise<ResolutionDetails<T>> {
    try {
      const { response } = await this.client.resolveObject({
        flagKey,
        context: this.convertContext(context),
      });
      return {
        value: (response.value ? Struct.toJson(response.value) : undefined) as T,
        reason: response.reason,
        variant: response.variant,
      };
    } catch (err: unknown) {
      return {
        reason: StandardResolutionReasons.ERROR,
        errorCode:
          (err as Partial<RpcError>)?.code ?? StandardResolutionReasons.UNKNOWN,
        value: defaultValue,
      };
    }
  }

  private convertContext(context: EvaluationContext): Struct {
    // JsonValue closely matches EvaluationContext, this is a safe cast.
    return Struct.fromJson(context as JsonValue);
  } 
}
