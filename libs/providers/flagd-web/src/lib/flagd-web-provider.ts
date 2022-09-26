import {
  EvaluationContext,
  ResolutionDetails,
} from '@openfeature/nodejs-sdk';
import { RpcError } from '@protobuf-ts/runtime-rpc';
import {
  createConnectTransport,
  createPromiseClient,
  PromiseClient,
} from "@bufbuild/connect-web";
import { Struct } from "@bufbuild/protobuf";
import { Service } from '../proto/ts/schema/v1/schema_connectweb'
export interface FlagdProviderOptions {
  host?: string;
  port?: number;
  protocol?: string;
}

export class FlagdProvider {
  metadata = {
    name: 'flagD Provider',
  };

  promiseClient: PromiseClient<typeof Service>

  constructor(options?: FlagdProviderOptions) {
    const {host, port, protocol}: FlagdProviderOptions = {
      host: "localhost",
      port: 8013,
      protocol: "http",
      ...options
    };
    const transport = createConnectTransport({
      baseUrl: `${protocol}://${host}:${port}`
    });
    this.promiseClient = createPromiseClient(Service, transport);
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
      return this.promiseClient.resolveBoolean({
        flagKey,
        context: Struct.fromJsonString(JSON.stringify(transformedContext)),
      }).then((res) => {
        return {
          value: res.value,
          reason: res.reason,
          variant: res.variant,
        }
      }).catch((err: unknown) => {
        return {
          reason: "ERROR",
          errorCode:
            (err as Partial<RpcError>)?.code ?? "UNKNOWN",
          value: defaultValue,
        };
      })
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    return this.promiseClient.resolveString({
      flagKey,
      context: Struct.fromJsonString(JSON.stringify(transformedContext)),
    }).then((res) => {
      return {
        value: res.value,
        reason: res.reason,
        variant: res.variant,
      }
    }).catch((err: unknown) => {
      return {
        reason: "ERROR",
        errorCode:
          (err as Partial<RpcError>)?.code ?? "UNKNOWN",
        value: defaultValue,
      };
    })
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    return this.promiseClient.resolveFloat({
      flagKey,
      context: Struct.fromJsonString(JSON.stringify(transformedContext)),
    }).then((res) => {
      return {
        value: res.value,
        reason: res.reason,
        variant: res.variant,
      }
    }).catch((err: unknown) => {
      return {
        reason: "ERROR",
        errorCode:
          (err as Partial<RpcError>)?.code ?? "UNKNOWN",
        value: defaultValue,
      };
    })
  }

  resolveObjectEvaluation<U extends object>(
    flagKey: string,
    defaultValue: U,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<U>> {
    return this.promiseClient.resolveObject({
      flagKey,
      context: Struct.fromJsonString(JSON.stringify(transformedContext)),
    }).then((res) => {
      return {
        value: res.value as U,
        reason: res.reason,
        variant: res.variant,
      }
    }).catch((err: unknown) => {
      return {
        reason: "ERROR",
        errorCode:
          (err as Partial<RpcError>)?.code ?? "UNKNOWN",
        value: defaultValue,
      };
    })
  }
}
