import { DataFetch } from '../data-fetch';
import { Config } from '../../../configuration';
import { FlagSyncServiceClient, SyncFlagsRequest, SyncFlagsResponse } from '../../../../proto/ts/sync/v1/sync_service';
import { ClientReadableStream, credentials } from '@grpc/grpc-js';
import { Logger } from '@openfeature/core';

export const initBackOffMs = 2 * 1000;
const maxStartupDeadlineMs = 500;
const maxBackOffMs = 120 * 1000;

/**
 * Implements the gRPC sync contract to fetch flag data.
 */
export class GrpcFetch implements DataFetch {
  private _connecting = false;
  private _nextBackoff = initBackOffMs;
  private _syncClient: FlagSyncServiceClient;
  private _syncStream: ClientReadableStream<SyncFlagsResponse> | undefined;
  private readonly _request: SyncFlagsRequest;
  private _logger: Logger | undefined;

  constructor(config: Config, syncServiceClient ?: FlagSyncServiceClient, logger?: Logger) {
    const { host, port, tls, socketPath, selector } = config;

    this._syncClient = syncServiceClient ? syncServiceClient : new FlagSyncServiceClient(
      socketPath ? `unix://${socketPath}` : `${host}:${port}`,
      tls ? credentials.createSsl() : credentials.createInsecure());

    this._logger = logger;
    this._request = { providerId: '', selector: selector ? selector : '' };
  }

  connect(dataFillCallback: (flags: string) => void,
          connectCallback: () => void, _: (flagsChanged: string[]) => void,
          disconnectCallback: () => void): Promise<void> {
    // note that we never reject the promise as sync is a long-running operation
    return new Promise((resolve) => this.listen(resolve, dataFillCallback, connectCallback, disconnectCallback));
  }

  disconnect() {
    this._logger?.debug('Disconnecting gRPC sync connection');
    this._syncStream?.cancel();
    this._syncClient.close();
  }

  private listen(
    resolveConnect: () => void,
    dataFillCallback: (flags: string) => void,
    connectCallback: () => void,
    disconnectCallback: () => void) {
    this._syncStream = this._syncClient.syncFlags(this._request);
    this._connecting = false;

    this._syncStream.on('data', (data: SyncFlagsResponse) => {
      this._logger?.debug('Received sync payload');
      dataFillCallback(data.flagConfiguration);
      connectCallback();
      resolveConnect();
      this._nextBackoff = initBackOffMs;
    });

    this._syncStream.on('error', (err: Error) => {
      this._logger?.error('Connection error, attempting to reconnect', err);
      disconnectCallback();
      this.reconnectWithBackoff(resolveConnect, dataFillCallback, connectCallback, disconnectCallback);
    });

    this._syncStream.on('end', () => {
      this._logger?.error('Stream ended, attempting to reconnect');
      disconnectCallback();
      this.reconnectWithBackoff(resolveConnect, dataFillCallback, connectCallback, disconnectCallback);
    });

  }

  private reconnectWithBackoff(
    resolver: () => void,
    dataFillCallback: (flags: string) => void,
    reconnectCallback: () => void,
    disconnectCallback: () => void): void {

    // avoid reattempts if already connecting
    // see - https://github.com/grpc/grpc-node/issues/2377
    if (this._connecting) {
      return;
    }

    this._logger?.debug(`Attempting to reconnection after ${this._nextBackoff}ms`);
    this._connecting = true;

    if (this._nextBackoff > maxStartupDeadlineMs) {
      resolver();
    }

    setTimeout(() => {
      this._nextBackoff = this._nextBackoff * 2;
      if (this._nextBackoff > maxBackOffMs) {
        this._nextBackoff = maxBackOffMs;
      }

      this.listen(resolver, dataFillCallback, reconnectCallback, disconnectCallback);
    }, this._nextBackoff);
  }
}
