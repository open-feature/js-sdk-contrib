import { ClientReadableStream, ServiceError, credentials } from '@grpc/grpc-js';
import { Logger } from '@openfeature/core';
import { GeneralError } from '@openfeature/server-sdk';
import { FlagSyncServiceClient, SyncFlagsRequest, SyncFlagsResponse } from '../../../../proto/ts/sync/v1/sync_service';
import { Config } from '../../../configuration';
import { DataFetch } from '../data-fetch';

/**
 * Implements the gRPC sync contract to fetch flag data.
 */
export class GrpcFetch implements DataFetch {
  private _syncClient: FlagSyncServiceClient;
  private _syncStream: ClientReadableStream<SyncFlagsResponse> | undefined;
  private readonly _request: SyncFlagsRequest;
  private _logger: Logger | undefined;

  constructor(config: Config, syncServiceClient?: FlagSyncServiceClient, logger?: Logger) {
    const { host, port, tls, socketPath, selector } = config;

    this._syncClient = syncServiceClient
      ? syncServiceClient
      : new FlagSyncServiceClient(
          socketPath ? `unix://${socketPath}` : `${host}:${port}`,
          tls ? credentials.createSsl() : credentials.createInsecure(),
        );

    this._logger = logger;
    this._request = { providerId: '', selector: selector ? selector : '' };
  }

  connect(
    dataFillCallback: (flags: string) => void,
    reconnectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: () => void,
  ): Promise<void> {
    // note that we never reject the promise as sync is a long-running operation
    return new Promise((resolve, reject) =>
      this.listen(dataFillCallback, reconnectCallback, changedCallback, disconnectCallback, resolve, reject),
    );
  }

  disconnect() {
    this._logger?.debug('Disconnecting gRPC sync connection');
    this._syncStream?.destroy();
    this._syncClient.close();
  }

  private listen(
    dataFillCallback: (flags: string) => void,
    reconnectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: () => void,
    resolveConnect?: () => void,
    rejectConnect?: (reason: Error) => void,
  ) {
    this._syncStream = this._syncClient.syncFlags(this._request);

    this._syncStream.on('data', (data: SyncFlagsResponse) => {
      this._logger?.debug('Received sync payload');
      dataFillCallback(data.flagConfiguration);
      changedCallback([]); // flags changed list not supported
      // if resolveConnect is undefined, this is a reconnection; we only want to fire the reconnect callback in that case
      if (resolveConnect) {
        resolveConnect();
      } else {
        reconnectCallback();
      }
    });

    this._syncStream.on('error', (err: ServiceError | undefined) => {
      this._logger?.error('Connection error, attempting to reconnect', err);
      disconnectCallback();
      rejectConnect?.(new GeneralError('Failed to connect stream'));
      this.reconnect(dataFillCallback, reconnectCallback, changedCallback, disconnectCallback);
    });
  }

  private reconnect(
    dataFillCallback: (flags: string) => void,
    reconnectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: () => void,
  ) {
    const channel = this._syncClient.getChannel();
    channel.watchConnectivityState(channel.getConnectivityState(true), Infinity, () => {
      this.listen(dataFillCallback, reconnectCallback, changedCallback, disconnectCallback);
    });
  }
}
