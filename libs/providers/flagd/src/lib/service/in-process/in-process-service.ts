import {Service} from "../service";
import {EvaluationContext, JsonValue, Logger, ResolutionDetails} from "@openfeature/core";
import {Config} from "../../configuration";
import {FlagSyncServiceClient, SyncFlagsResponse} from "../../../proto/ts/flagd/sync/v1/sync";
import {credentials} from "@grpc/grpc-js";
import {FlagdCore} from "@openfeature/flagd-core";

export class InProcessService implements Service {

  private _syncClient: FlagSyncServiceClient;
  private _flagdCore: FlagdCore;

  constructor(config: Config) {
    const {host, port, tls, socketPath} = config;
    this._syncClient = new FlagSyncServiceClient(
      socketPath ? `unix://${socketPath}` : `${host}:${port}`,
      tls ? credentials.createSsl() : credentials.createInsecure());
    this._flagdCore = new FlagdCore();
  }

  connect(reconnectCallback: () => void, changedCallback: (flagsChanged: string[]) => void, disconnectCallback: () => void): Promise<void> {
    // todo inject selector from configurations
    const syncFlags = this._syncClient.syncFlags({providerId: "", selector: ""});

    syncFlags.on('data', (data: SyncFlagsResponse) => {
      this._flagdCore.setConfigurations(data.flagConfiguration)
    })

    syncFlags.on('error', (err: Error) => {
      console.error(err)
      // todo handle reconnect
    })

    syncFlags.on('close', () => {
      // todo handle reconnect
      console.log("connection closed")
    })

    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve(undefined);
  }

  resolveBoolean(flagKey: string, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<boolean>> {
    return Promise.resolve(this._flagdCore.resolveBooleanEvaluation(flagKey, ));
  }

  resolveNumber(flagKey: string, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<number>> {

    // todo from resolver
    return Promise.resolve({value: 0});
  }

  resolveObject<T extends JsonValue>(flagKey: string, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<T>> {

    // todo from resolver
    return Promise.resolve({value: {} as T});
  }

  resolveString(flagKey: string, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<string>> {

    // todo from resolver
    return Promise.resolve({value: ""});
  }

}
