import {DataFetch} from "../data-fetch";
import {Config} from "../../../configuration";
import {FlagSyncServiceClient, SyncFlagsRequest, SyncFlagsResponse} from "../../../../proto/ts/sync/v1/sync_service";
import {ClientReadableStream, credentials} from "@grpc/grpc-js";

export class GrpcFetch implements DataFetch {
  private readonly _maxStartupDeadlineMs = 500;
  private readonly _initBackOffMs = 2 * 1000;
  private readonly _maxBackOffMs = 120 * 1000;
  private _nextBackoff = this._initBackOffMs;

  private _syncClient: FlagSyncServiceClient;
  private _syncStream: ClientReadableStream<SyncFlagsResponse> | undefined;
  private readonly _request: SyncFlagsRequest;

  constructor(config: Config, syncServiceClient ?: FlagSyncServiceClient) {
    const {host, port, tls, socketPath} = config;

    this._syncClient = syncServiceClient ? syncServiceClient : new FlagSyncServiceClient(
      socketPath ? `unix://${socketPath}` : `${host}:${port}`,
      tls ? credentials.createSsl() : credentials.createInsecure());

    this._request = {providerId: "", selector: config.selector};
  }

  connect(dataFillCallback: (flags: string) => void, connectCallback: () => void, _: (flagsChanged: string[]) => void, disconnectCallback: () => void): Promise<void> {
    // note that we never reject the promise as sync is a long-running operation
    return new Promise((resolve) => this.listen(resolve, dataFillCallback, connectCallback, disconnectCallback));
  }

  disconnect() {
    console.log("Disconnecting gRPC sync connection")
    this._syncStream?.cancel();
    this._syncClient.close();
  }

  private listen(
    resolveConnect: () => void,
    dataFillCallback: (flags: string) => void,
    connectCallback: () => void,
    disconnectCallback: () => void) {

    this._syncStream = this._syncClient.syncFlags(this._request);

    this._syncStream.on('data', (data: SyncFlagsResponse) => {
      console.debug("Received sync payload")
      dataFillCallback(data.flagConfiguration);
      connectCallback();
      resolveConnect();
      this._nextBackoff = this._initBackOffMs;
    })

    this._syncStream.on('close', () => {
      console.error("Connection closed, attempting to reconnect");
      disconnectCallback();
      this.reconnectWithBackoff(resolveConnect, dataFillCallback, connectCallback, disconnectCallback);
    })
  }

  private reconnectWithBackoff(
    resolver: () => void,
    dataFillCallback: (flags: string) => void,
    reconnectCallback: () => void,
    disconnectCallback: () => void): void {

    console.debug(`Attempting to reconnection after ${this._nextBackoff}ms`);

    if (this._nextBackoff > this._maxStartupDeadlineMs) {
      resolver();
    }

    setTimeout(() => {
      this._nextBackoff = this._nextBackoff * 2;
      if (this._nextBackoff > this._maxBackOffMs) {
        this._nextBackoff = this._maxBackOffMs;
      }

      this.listen(resolver, dataFillCallback, reconnectCallback, disconnectCallback);
    }, this._nextBackoff)
  }
}
