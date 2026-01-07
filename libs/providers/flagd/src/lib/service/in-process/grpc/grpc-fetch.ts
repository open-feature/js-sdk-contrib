import type { ClientReadableStream, ServiceError } from '@grpc/grpc-js';
import type { EvaluationContext, Logger } from '@openfeature/server-sdk';
import { GeneralError } from '@openfeature/server-sdk';
import type { SyncFlagsRequest, SyncFlagsResponse } from '../../../../proto/ts/flagd/sync/v1/sync';
import { FlagSyncServiceClient } from '../../../../proto/ts/flagd/sync/v1/sync';
import type { Config } from '../../../configuration';
import { buildClientOptions, closeStreamIfDefined, createChannelCredentials } from '../../common';
import type { DataFetch } from '../data-fetch';

/**
 * Implements the gRPC sync contract to fetch flag data.
 */
export class GrpcFetch implements DataFetch {
  private readonly _syncClient: FlagSyncServiceClient;
  private readonly _request: SyncFlagsRequest;
  private _syncStream: ClientReadableStream<SyncFlagsResponse> | undefined;
  private readonly _setSyncContext: (syncContext: EvaluationContext) => void;
  private _logger: Logger | undefined;
  /**
   * Initialized will be set to true once the initial connection is successful
   * and the first payload has been received. Subsequent reconnects will not
   * change the initialized value.
   */
  private _initialized = false;
  /**
   * Is connected represents the current known connection state. It will be
   * set to true once the first payload has been received.but will be set to
   * false if the connection is lost.
   */
  private _isConnected = false;

  constructor(
    config: Config,
    setSyncContext: (syncContext: EvaluationContext) => void,
    syncServiceClient?: FlagSyncServiceClient,
    logger?: Logger,
  ) {
    const { host, port, tls, socketPath, certPath, selector } = config;
    const clientOptions = buildClientOptions(config);
    const channelCredentials = createChannelCredentials(tls, certPath);

    this._syncClient = syncServiceClient
      ? syncServiceClient
      : new FlagSyncServiceClient(
          socketPath ? `unix://${socketPath}` : `${host}:${port}`,
          channelCredentials,
          clientOptions,
        );

    this._setSyncContext = setSyncContext;
    this._logger = logger;
    this._request = { providerId: '', selector: selector ? selector : '' };
  }

  async connect(
    dataCallback: (flags: string) => string[],
    reconnectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: (message: string) => void,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.listen(dataCallback, reconnectCallback, changedCallback, disconnectCallback, resolve, reject),
    );
    this._initialized = true;
  }

  async disconnect() {
    this._logger?.debug('Disconnecting gRPC sync connection');
    closeStreamIfDefined(this._syncStream);
    this._syncClient.close();
  }

  private listen(
    dataCallback: (flags: string) => string[],
    reconnectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: (message: string) => void,
    resolveConnect?: () => void,
    rejectConnect?: (reason: Error) => void,
  ) {
    this._logger?.debug('Starting gRPC sync connection');
    closeStreamIfDefined(this._syncStream);
    try {
      this._syncStream = this._syncClient.syncFlags(this._request);
      this._syncStream.on('data', (data: SyncFlagsResponse) => {
        this._logger?.debug(`Received sync payload`);

        try {
          if (data.syncContext) {
            this._setSyncContext(data.syncContext);
          }
          const changes = dataCallback(data.flagConfiguration);
          if (this._initialized && changes.length > 0) {
            changedCallback(changes);
          }
        } catch (err) {
          this._logger?.debug('Error processing sync payload: ', (err as Error)?.message ?? 'unknown error');
        }

        if (resolveConnect) {
          resolveConnect();
        } else if (!this._isConnected) {
          // Not the first connection and there's no active connection.
          this._logger?.debug('Reconnected to gRPC sync');
          reconnectCallback();
        }
        this._isConnected = true;
      });

      this._syncStream.on('error', (err: ServiceError | undefined) => {
        this.handleError(
          err as Error,
          dataCallback,
          reconnectCallback,
          changedCallback,
          disconnectCallback,
          rejectConnect,
        );
      });
    } catch (err) {
      this.handleError(
        err as Error,
        dataCallback,
        reconnectCallback,
        changedCallback,
        disconnectCallback,
        rejectConnect,
      );
    }
  }

  private handleError(
    err: Error,
    dataCallback: (flags: string) => string[],
    reconnectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: (message: string) => void,
    rejectConnect?: (reason: Error) => void,
  ) {
    this._logger?.error('Connection error, attempting to reconnect');
    this._logger?.debug(err);
    this._isConnected = false;
    const errorMessage = err?.message ?? 'Failed to connect to syncFlags stream';
    disconnectCallback(errorMessage);
    rejectConnect?.(new GeneralError(errorMessage));
    this.reconnect(dataCallback, reconnectCallback, changedCallback, disconnectCallback);
  }

  private reconnect(
    dataCallback: (flags: string) => string[],
    reconnectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: (message: string) => void,
  ) {
    const channel = this._syncClient.getChannel();
    channel.watchConnectivityState(channel.getConnectivityState(true), Infinity, () => {
      this.listen(dataCallback, reconnectCallback, changedCallback, disconnectCallback);
    });
  }
}
