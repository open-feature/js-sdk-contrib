import {IService} from '../IService'
import {ServiceClient} from '../../../proto/ts/schema/v1/schema.client'
import * as grpc from '@grpc/grpc-js';
import {
    EvaluationContext,
    ResolutionDetails
} from '@openfeature/nodejs-sdk'
import {
    ResolveBooleanRequest,
    ResolveStringRequest,
    ResolveNumberRequest,
    ResolveObjectRequest
} from '../../../proto/ts/schema/v1/schema'
import { RpcError } from '@protobuf-ts/runtime-rpc'
import { Struct } from '../../../proto/ts/google/protobuf/struct'
import client from './client'

export class GRPCService implements IService {
    client: ServiceClient;
    constructor(host?: string, port?: number, credentials?: grpc.ChannelCredentials) {
        this.client = new client(host, port, credentials)
    }


    async ResolveBoolean(flagKey: string, defaultValue: boolean, context: EvaluationContext): Promise<ResolutionDetails<boolean>> {
        const res: ResolutionDetails<boolean> = {
            value: defaultValue
        }
        const req: ResolveBooleanRequest = {
            flagKey,
            context: Struct.fromJsonString(JSON.stringify(context)),
        }
        await this.client.resolveBoolean(req, undefined).response.then(callRes => {
            res.reason = callRes.reason
            res.value = callRes.value
            res.variant = callRes.variant
        }).catch((err: RpcError) => {
            res.reason = "ERROR"
            res.errorCode = err.code
            res.variant = "default_value"
        })
        return res
    }


    async ResolveString(flagKey: string, defaultValue: string, context: EvaluationContext): Promise<ResolutionDetails<string>> {
        const res: ResolutionDetails<string> = {
            value: defaultValue
        }
        const req: ResolveStringRequest = {
            flagKey,
            context: Struct.fromJsonString(JSON.stringify(context)),
        }
        await this.client.resolveString(req, undefined).response.then(callRes => {
            res.reason = callRes.reason
            res.value = callRes.value
            res.variant = callRes.variant
        }).catch((err: RpcError) => {
            res.reason = "ERROR"
            res.errorCode = err.code
            res.variant = "default_value"
        })
        return res
    }


    async ResolveNumber(flagKey: string, defaultValue: number, context: EvaluationContext): Promise<ResolutionDetails<number>> {
        const res: ResolutionDetails<number> = {
              value: defaultValue
          }
        const req: ResolveNumberRequest = {
            flagKey,
            context: Struct.fromJsonString(JSON.stringify(context)),
        }
        await this.client.resolveNumber(req, undefined).response.then(callRes => {
            res.reason = callRes.reason
            res.value = callRes.value
            res.variant = callRes.variant
        }).catch((err: RpcError) => {
            res.reason = "ERROR"
            res.errorCode = err.code
            res.variant = "default_value"
        })
        return res
    }


    async ResolveObject<T extends object>(flagKey: string, defaultValue: T, context: EvaluationContext): Promise<ResolutionDetails<T>> {
        const res: ResolutionDetails<T> = {
          value: defaultValue
        }
        const req: ResolveObjectRequest = {
            flagKey,
            context: Struct.fromJsonString(JSON.stringify(context)),
        }
        await this.client.resolveObject(req, undefined).response.then(callRes => {
            res.reason = callRes.reason
            res.value = callRes.value as T
            res.variant = callRes.variant
        }).catch((err: RpcError) => {
            res.reason = "ERROR"
            res.errorCode = err.code
            res.variant = "default_value"
        })
        return res
    }
}
