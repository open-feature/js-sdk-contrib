import {IService} from '../IService'
import {ServiceClient} from '../../../proto/ts/schema/v1/schema.client'
import * as grpc from '@grpc/grpc-js';
import {
    EvaluationContext,
    ResolutionDetails,
    StandardResolutionReasons
} from '@openfeature/nodejs-sdk'
import { RpcError } from '@protobuf-ts/runtime-rpc'
import { Struct } from '../../../proto/ts/google/protobuf/struct'
import {GRPCClient} from './client'

export class GRPCService implements IService {
    client: ServiceClient;
    constructor(host?: string, port?: number, credentials?: grpc.ChannelCredentials) {
        this.client = new GRPCClient(host, port, credentials)
    }

    async ResolveBoolean(flagKey: string, defaultValue: boolean, context: EvaluationContext): Promise<ResolutionDetails<boolean>> {
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
          reason: 'ERROR',
          errorCode: (err as Partial<RpcError>)?.code ?? StandardResolutionReasons.UNKNOWN,
          variant: 'default_value',
          value: defaultValue,
        }
      }
    }


    async ResolveString(flagKey: string, defaultValue: string, context: EvaluationContext): Promise<ResolutionDetails<string>> {
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
          reason: 'ERROR',
          errorCode: (err as Partial<RpcError>)?.code ?? StandardResolutionReasons.UNKNOWN,
          variant: 'default_value',
          value: defaultValue,
        }
      }
    }


    async ResolveNumber(flagKey: string, defaultValue: number, context: EvaluationContext): Promise<ResolutionDetails<number>> {
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
          reason: 'ERROR',
          errorCode: (err as Partial<RpcError>)?.code ?? StandardResolutionReasons.UNKNOWN,
          variant: 'default_value',
          value: defaultValue,
        }
      }
    }

    async ResolveObject<T extends object>(flagKey: string, defaultValue: T, context: EvaluationContext): Promise<ResolutionDetails<T>> {
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
          reason: 'ERROR',
          errorCode: (err as Partial<RpcError>)?.code ?? StandardResolutionReasons.UNKNOWN,
          variant: 'default_value',
          value: defaultValue,
        }
      }
    }
}
