import {DataFetch} from "../data-fetch";
import {Config} from "../../../configuration";
import {FlagSyncServiceClient, SyncFlagsRequest, SyncFlagsResponse} from "../../../../proto/ts/sync/v1/sync_service";
import {ClientReadableStream, credentials} from "@grpc/grpc-js";

export class GrpcFetch implements DataFetch {

  /**
   *     private static final int INIT_BACK_OFF = 2 * 1000;
   *     private static final int MAX_BACK_OFF = 120 * 1000;
   * */


  private readonly _initBackOffMs = 2 * 1000;
  private readonly _maxBackOffMs = 120 * 1000;

  private _backoff = this._initBackOffMs;

  private _syncClient: FlagSyncServiceClient;
  private _syncStream: ClientReadableStream<SyncFlagsResponse>;

  constructor(config: Config) {
    const {host, port, tls, socketPath} = config;

    this._syncClient = new FlagSyncServiceClient(
      socketPath ? `unix://${socketPath}` : `${host}:${port}`,
      tls ? credentials.createSsl() : credentials.createInsecure());
    this._syncStream = this._syncClient.syncFlags(<SyncFlagsRequest>{providerId: "", selector: config.selector});
  }


  connect(dataFillCallback: (flags: string) => void, connectCallback: () => void, _: (flagsChanged: string[]) => void, disconnectCallback: () => void): Promise<void> {
    return this.listen(dataFillCallback, connectCallback, disconnectCallback);
  }

  disconnect() {
    console.log("Disconnecting gRPC sync connection")
    this._syncStream.cancel();
    this._syncClient.close();
  }

  private listen(dataFillCallback: (flags: string) => void, connectCallback: () => void, disconnectCallback: () => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._syncStream.on('data', (data: SyncFlagsResponse) => {
        dataFillCallback(data.flagConfiguration);
        resolve();
        connectCallback();
        this._backoff = this._initBackOffMs;
      })

      this._syncStream.on('error', (err: Error) => {
        console.error("Error from grpc sync connection, attempting to reconnect", err);
        reject("Connection error");
        disconnectCallback();
        this.reconnectWithBackoff(dataFillCallback, connectCallback, disconnectCallback);
      })

      this._syncStream.on('close', () => {
        console.warn("gRPC sync stream closed, attempting to reconnect");
        disconnectCallback();
        this.reconnectWithBackoff(dataFillCallback, connectCallback, disconnectCallback);
      })
    })

  }

  private reconnectWithBackoff(
    dataFillCallback: (flags: string) => void,
    reconnectCallback: () => void,
    disconnectCallback: () => void): void {

    setTimeout(() => {
      this._backoff = this._backoff * 2;
      if (this._backoff > this._maxBackOffMs) {
        this._backoff = this._maxBackOffMs;
      }

      this.listen(dataFillCallback, reconnectCallback, disconnectCallback)
        .catch(reason => console.warn(reason))
    }, this._backoff)

  }

}
