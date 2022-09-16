import {
  EvaluationContext,
  ResolutionDetails,
  EventCallbackMessage,
  EventCallbackError,
  EventContext
} from '@openfeature/nodejs-sdk';
import { RpcError } from '@protobuf-ts/runtime-rpc';
import {
  createConnectTransport,
  createPromiseClient,
  PromiseClient,
  CallbackClient,
  createCallbackClient
} from "@bufbuild/connect-web";
import { Struct } from "@bufbuild/protobuf";
import { Service as ConnectServiceStub } from '../proto/ts/schema/v1/schema_connectweb'
export interface FlagdProviderOptions {
  host?: string;
  port?: number;
}

export class FlagdProvider {
  metadata = {
    name: 'flagD Provider',
  };

  eventCallbacksMessage: EventCallbackMessage[] = [];
  eventCallbacksError: EventCallbackError[] = [];
  promiseClient: PromiseClient<typeof ConnectServiceStub>
  callbackClient: CallbackClient<typeof ConnectServiceStub>

  constructor(options?: FlagdProviderOptions) {
    const {host, port}: FlagdProviderOptions = {
      host: "localhost",
      port: 8013,
      ...options
    };
    const transport = createConnectTransport({
      baseUrl: `http://${host}:${port}`
    });
    this.promiseClient = createPromiseClient(ConnectServiceStub, transport);
    this.callbackClient = createCallbackClient(ConnectServiceStub, transport);

    this.callbackClient.eventStream(
      {},
      (message) => {
        const m: EventContext = {
          notificationType: message.type
        }
        for (const func of this.eventCallbacksMessage) {
          func(m)
        }
      },
      (err) => {
        for (const func of this.eventCallbacksError) {
          func(err as Error)
        }
      },
    )
  }

  addMessageListener(func: EventCallbackMessage): void {
    this.eventCallbacksMessage.push(func);
  }
  addErrorListener(func: EventCallbackError): void {
    this.eventCallbacksError.push(func);
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
