
import { RpcError } from '@protobuf-ts/runtime-rpc';
import {
  createConnectTransport,
  createPromiseClient,
  PromiseClient,
} from "@bufbuild/connect-web";
import {
  EvaluationContext,
  ResolutionDetails,
  StandardResolutionReasons,
} from '@openfeature/nodejs-sdk';
import { Struct } from "@bufbuild/protobuf";
import { Service as ConnectServiceStub } from '../../../proto/ts/schema/v1/schema_connectweb'
import { Service } from '../Service';

interface FlagdWebProviderOptions {
    host?: string;
    port?: number;
  }

  export class ConnectService implements Service {
    metadata = {
      name: 'FlagD Web Provider',
    };
    client: PromiseClient<typeof ConnectServiceStub>
    constructor(options: FlagdWebProviderOptions) {
      const {host, port}: FlagdWebProviderOptions = {
        host: "localhost",
        port: 8013,
        ...options
      };
      const transport = createConnectTransport({
        baseUrl: `http://${host}:${port}`
      });
      this.client = createPromiseClient(ConnectServiceStub, transport);
    }

    async resolveBoolean(
      flagKey: string,
      defaultValue: boolean,
      context: EvaluationContext,
    ): Promise<ResolutionDetails<boolean>> {
      try {
        const res = await this.client.resolveBoolean({
          flagKey,
          context: Struct.fromJsonString(JSON.stringify(context)),
        });
        return {
          value: res.value,
          reason: res.reason,
          variant: res.variant,
        };
      } catch (err: unknown) {
        return {
          reason: "ERROR",
          errorCode:
            (err as Partial<RpcError>)?.code ?? "UNKNOWN",
          value: defaultValue,
        };
      }
    }

    async resolveString(
      flagKey: string,
      defaultValue: string,
      context: EvaluationContext,
    ): Promise<ResolutionDetails<string>> {
      try {
        const res = await this.client.resolveString({
          flagKey,
          context: Struct.fromJsonString(JSON.stringify(context)),
        });
        return {
          value: res.value,
          reason: res.reason,
          variant: res.variant,
        };
      } catch (err: unknown) {
        return {
          reason: "ERROR",
          errorCode:
            (err as Partial<RpcError>)?.code ?? "UNKNOWN",
          value: defaultValue,
        };
      }
    }

    async resolveNumber(
      flagKey: string,
      defaultValue: number,
      context: EvaluationContext,
    ): Promise<ResolutionDetails<number>> {
      try {
        const res = await this.client.resolveFloat({
          flagKey,
          context: Struct.fromJsonString(JSON.stringify(context)),
        });
        return {
          value: res.value,
          reason: res.reason,
          variant: res.variant,
        };
      } catch (err: unknown) {
        return {
          reason: "ERROR",
          errorCode:
            (err as Partial<RpcError>)?.code ?? "UNKNOWN",
          value: defaultValue,
        };
      }
    }

    async resolveObject<U extends object>(
      flagKey: string,
      defaultValue: U,
      context: EvaluationContext,
    ): Promise<ResolutionDetails<U>> {
      try {
        const res = await this.client.resolveObject({
          flagKey,
          context: Struct.fromJsonString(JSON.stringify(context)),
        });
        return {
          value: res.value as U,
          reason: res.reason,
          variant: res.variant,
        };
      } catch (err: unknown) {
        return {
          reason: "ERROR",
          errorCode:
            (err as Partial<RpcError>)?.code ?? "UNKNOWN",
          value: defaultValue,
        };
      }
    }
  }
