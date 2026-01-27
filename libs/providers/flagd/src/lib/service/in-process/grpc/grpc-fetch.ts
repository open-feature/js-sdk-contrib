import type { ClientReadableStream, ServiceError } from '@grpc/grpc-js';
import type { EvaluationContext, Logger } from '@openfeature/server-sdk';
import { GeneralError } from '@openfeature/server-sdk';
import type { SyncFlagsRequest, SyncFlagsResponse } from '../../../../proto/ts/flagd/sync/v1/sync';
import { FlagSyncServiceClient } from '../../../../proto/ts/flagd/sync/v1/sync';
import type { FlagdGrpcConfig } from '../../../configuration';
import {
  buildClientOptions,
  closeStreamIfDefined,
  createChannelCredentials,
  createFatalStatusCodesSet,
  handleFatalStatusCodeError,
  isFatalStatusCodeError,
} from '../../common';
import type { DataFetch } from '../data-fetch';
import { DEFAULT_MAX_BACKOFF_MS } from '../../../constants';

/**
 * Implements the gRPC sync contract to fetch flag data.
 */
export class GrpcFetch implements DataFetch {
  private readonly _syncClient: FlagSyncServiceClient;
  private readonly _request: SyncFlagsRequest;
  private readonly _deadlineMs: number;
  private readonly _maxBackoffMs: number;
  private readonly _streamDeadlineMs: number;
  private _syncStream: ClientReadableStream<SyncFlagsResponse> | undefined;
  private readonly _setSyncContext: (syncContext: EvaluationContext) => void;
  private _logger: Logger | undefined;
  private readonly _fatalStatusCodes: Set<number>;
  private _errorThrottled = false;
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
    config: FlagdGrpcConfig,
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

    this._deadlineMs = config.deadlineMs;
    this._maxBackoffMs = config.retryBackoffMaxMs || DEFAULT_MAX_BACKOFF_MS;
    this._streamDeadlineMs = config.streamDeadlineMs;
    this._setSyncContext = setSyncContext;
    this._logger = logger;
    this._request = { providerId: '', selector: selector ? selector : '' };
    this._fatalStatusCodes = createFatalStatusCodesSet(config.fatalStatusCodes, logger);
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
      // wait for connection to be stable
      this._syncClient.waitForReady(Date.now() + this._deadlineMs, (err) => {
        if (err) {
          this.handleError(
            err as Error,
            dataCallback,
            reconnectCallback,
            changedCallback,
            disconnectCallback,
            rejectConnect,
          );
        } else {
          const streamDeadline = this._streamDeadlineMs != 0 ? Date.now() + this._streamDeadlineMs : undefined;
          const stream = this._syncClient.syncFlags(this._request, { deadline: streamDeadline });
          stream.on('data', (data: SyncFlagsResponse) => {
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
          stream.on('error', (err: ServiceError | undefined) => {
            // In cases where we get an explicit error status, we add a delay.
            // This prevents tight loops when errors are returned immediately, typically by intervening proxies like Envoy.
            this._errorThrottled = true;
            this.handleError(
              err as Error,
              dataCallback,
              reconnectCallback,
              changedCallback,
              disconnectCallback,
              rejectConnect,
            );
          });
          this._syncStream = stream;
        }
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
    // Check if error is a fatal status code on first connection only
    if (isFatalStatusCodeError(err, this._initialized, this._fatalStatusCodes)) {
      this._isConnected = false;
      handleFatalStatusCodeError(err, this._logger, disconnectCallback, rejectConnect);
      return;
    }

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
    setTimeout(
      () => this.listen(dataCallback, reconnectCallback, changedCallback, disconnectCallback),
      this._errorThrottled ? this._maxBackoffMs : 0,
    );
    this._errorThrottled = false;
  }
}
