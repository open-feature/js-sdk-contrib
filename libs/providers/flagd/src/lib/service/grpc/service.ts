import { RpcError } from '@protobuf-ts/runtime-rpc'
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import * as grpc from '@grpc/grpc-js';
import {
    EvaluationContext,
    ResolutionDetails,
    StandardResolutionReasons
} from '@openfeature/nodejs-sdk'
import { Struct } from '../../../proto/ts/google/protobuf/struct'
import {ServiceClient} from '../../../proto/ts/schema/v1/schema.client'
import {Service} from '../Service'

interface GRPCServiceOptions {
  host: string,
  port: number,
}
export class GRPCService implements Service {
    client: ServiceClient;

    constructor(options: GRPCServiceOptions) {
      const {
        host,
        port
      } = options
      this.client = new ServiceClient(new GrpcTransport({
        host: `${host}:${port}`,
        channelCredentials: grpc.credentials.createInsecure()
      }))
    }

    async resolveBoolean(flagKey: string, defaultValue: boolean, context: EvaluationContext): Promise<ResolutionDetails<boolean>> {
      try {
        const { response } = await this.client.resolveBoolean({
          flagKey,
          context: Struct.fromJsonString(JSON.stringify(context)),
        });
        return {
          value: response.value,
          reason: response.reason,
          variant: response.variant,
        };
      } catch (err: unknown) {
        return {
          reason: StandardResolutionReasons.ERROR,
          errorCode: (err as Partial<RpcError>)?.code ?? StandardResolutionReasons.UNKNOWN,
          value: defaultValue,
        }
      }
    }


    async resolveString(flagKey: string, defaultValue: string, context: EvaluationContext): Promise<ResolutionDetails<string>> {
      try {
        const { response } = await this.client.resolveString({
          flagKey,
          context: Struct.fromJsonString(JSON.stringify(context)),
        });
        return {
          value: response.value,
          reason: response.reason,
          variant: response.variant,
        };
      } catch (err: unknown) {
        return {
          reason: StandardResolutionReasons.ERROR,
          errorCode: (err as Partial<RpcError>)?.code ?? StandardResolutionReasons.UNKNOWN,
          value: defaultValue,
        }
      }
    }


    async resolveNumber(flagKey: string, defaultValue: number, context: EvaluationContext): Promise<ResolutionDetails<number>> {
      try {
        const { response } = await this.client.resolveNumber({
          flagKey,
          context: Struct.fromJsonString(JSON.stringify(context)),
        });
        return {
          value: response.value,
          reason: response.reason,
          variant: response.variant,
        };
      } catch (err: unknown) {
        return {
          reason: StandardResolutionReasons.ERROR,
          errorCode: (err as Partial<RpcError>)?.code ?? StandardResolutionReasons.UNKNOWN,
          value: defaultValue,
        }
      }
    }

    async resolveObject<T extends object>(flagKey: string, defaultValue: T, context: EvaluationContext): Promise<ResolutionDetails<T>> {
      try {
        const { response } = await this.client.resolveObject({
          flagKey,
          context: Struct.fromJsonString(JSON.stringify(context)),
        });
        return {
          value: response.value as T,
          reason: response.reason,
          variant: response.variant,
        };
      } catch (err: unknown) {
        return {
          reason: StandardResolutionReasons.ERROR,
          errorCode: (err as Partial<RpcError>)?.code ?? StandardResolutionReasons.UNKNOWN,
          value: defaultValue,
        }
      }
    }
}
