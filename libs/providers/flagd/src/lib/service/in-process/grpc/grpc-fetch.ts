import {DataFetch} from "../data-fetch";
import {Config} from "../../../configuration";
import {FlagSyncServiceClient, SyncFlagsRequest, SyncFlagsResponse} from "../../../../proto/ts/sync/v1/sync_service";
import {ClientReadableStream, credentials} from "@grpc/grpc-js";

export class GrpcFetch implements DataFetch {

  private _syncClient: FlagSyncServiceClient;
  private _syncStream: ClientReadableStream<SyncFlagsResponse>;

  constructor(config: Config) {
    const {host, port, tls, socketPath} = config;

    this._syncClient = new FlagSyncServiceClient(
      socketPath ? `unix://${socketPath}` : `${host}:${port}`,
      tls ? credentials.createSsl() : credentials.createInsecure());
    this._syncStream = this._syncClient.syncFlags(<SyncFlagsRequest>{providerId: "", selector: config.selector});
  }


  connect(dataFillCallback: (flags: string) => void, reconnectCallback: () => void, changedCallback: (flagsChanged: string[]) => void, disconnectCallback: () => void): void {
  }


  disconnect() {
    this._syncStream.cancel();
    this._syncClient.close();
  }

  private syncHandler(dataFillCallback: (flags: string) => void) {
    this._syncStream.on('data', (data: SyncFlagsResponse) => {
      dataFillCallback(data.flagConfiguration)
    })

    this._syncStream.on('error', (err: Error) => {
      console.error(err)
    })

    this._syncStream.on('close', () => {
      console.log("connection closed")
    })
  }

}
