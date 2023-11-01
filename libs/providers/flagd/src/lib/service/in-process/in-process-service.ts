import {Service} from "../service";
import {EvaluationContext, JsonValue, Logger, ResolutionDetails} from "@openfeature/core";
import {Config} from "../../configuration";
import {FlagSyncServiceClient, SyncFlagsRequest, SyncFlagsResponse} from "../../../proto/ts/flagd/sync/v1/sync";
import {ClientReadableStream, credentials} from "@grpc/grpc-js";
import {FlagdCore} from "@openfeature/flagd-core";

export class InProcessService implements Service {
  private _syncClient: FlagSyncServiceClient;
  private _flagdCore: FlagdCore;
  private _syncStream: ClientReadableStream<SyncFlagsResponse> | undefined = undefined;
  private readonly _selector: string | undefined = "";

  constructor(config: Config) {
    const {host, port, tls, socketPath} = config;
    this._syncClient = new FlagSyncServiceClient(
      socketPath ? `unix://${socketPath}` : `${host}:${port}`,
      tls ? credentials.createSsl() : credentials.createInsecure());
    this._flagdCore = new FlagdCore();
    this._selector = config.selector
  }

  connect(reconnectCallback: () => void, changedCallback: (flagsChanged: string[]) => void, disconnectCallback: () => void): Promise<void> {
    // todo handle reconnect

    this._syncStream = this._syncClient.syncFlags(<SyncFlagsRequest>{providerId: "", selector: this._selector});

    this._syncStream.on('data', (data: SyncFlagsResponse) => {
      this._flagdCore.setConfigurations(data.flagConfiguration)
    })

    this._syncStream.on('error', (err: Error) => {
      console.error(err)
    })

    this._syncStream.on('close', () => {
      console.log("connection closed")
    })

    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    this._syncStream?.cancel()
    this._syncClient.close()
  }

  async resolveBoolean(flagKey: string, defaultValue: boolean, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<boolean>> {
    return Promise.resolve(this._flagdCore.resolveBooleanEvaluation(flagKey, defaultValue, context, logger));
  }

  async resolveNumber(flagKey: string, defaultValue: number, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<number>> {
    return Promise.resolve(this._flagdCore.resolveNumberEvaluation(flagKey, defaultValue, context, logger));
  }

  async resolveString(flagKey: string, defaultValue: string, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<string>> {
    return Promise.resolve(this._flagdCore.resolveStringEvaluation(flagKey, defaultValue, context, logger));
  }

  async resolveObject<T extends JsonValue>(flagKey: string, defaultValue: T, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<T>> {
    return Promise.resolve(this._flagdCore.resolveObjectEvaluation(flagKey, defaultValue, context, logger));
  }

}
