import { GrpcFetch } from './grpc-fetch';
import { Config } from '../../../configuration';
import { FlagSyncServiceClient, SyncFlagsResponse, SyncState } from '../../../../proto/ts/sync/v1/sync_service';
import { ConnectivityState } from '@grpc/grpc-js/build/src/connectivity-state';

describe('grpc fetch', () => {
  const cfg: Config = { host: 'localhost', port: 8000, tls: false, socketPath: '' };

  it('should handle data sync and emit callbacks', () => {
    // given
    const flagResponse = '{"flags":{}}';

    const serviceMock: FlagSyncServiceClient = {
      syncFlags: jest.fn(() => {
        return {
          // mock event registration callback response
          on: jest.fn((event: string, callback: (data: SyncFlagsResponse) => void) => {
            if (event === 'data') {
              callback({
                flagConfiguration: flagResponse,
                state: SyncState.SYNC_STATE_ALL,
              });
            }
            return {};
          }),
        };
      }),
    } as unknown as FlagSyncServiceClient;

    let callBackResponse = '';

    const dataFillCallback = jest.fn((flags: string) => {
      callBackResponse = flags;
      return [];
    });
    const connectCallback = jest.fn();
    const disconnectCallback = jest.fn();

    // when
    const fetch = new GrpcFetch(cfg, serviceMock);
    fetch.connect(dataFillCallback, connectCallback, jest.fn(), disconnectCallback);

    // then
    expect(dataFillCallback).toHaveBeenCalledTimes(1);
    expect(disconnectCallback).toHaveBeenCalledTimes(0);
    expect(callBackResponse).toBe(flagResponse);
  });

  it('should handle error and watch channel for reconnect', () => {
    const mockChannel = {
      getConnectivityState: jest.fn(() => ConnectivityState.READY),
      watchConnectivityState: jest.fn(() => {
        // empty
      }),
    };

    // given
    const serviceMock: FlagSyncServiceClient = {
      getChannel: jest.fn(() => {
        return mockChannel;
      }),
      syncFlags: jest.fn(() => {
        return {
          on: jest.fn((event: string, callback: (err: Error) => void) => {
            if (event === 'error') {
              callback(new Error('Some connection error'));
            }
            return {};
          }),
        };
      }),
    } as unknown as FlagSyncServiceClient;

    const disconnectCallback = jest.fn();

    // when
    const fetch = new GrpcFetch(cfg, serviceMock);
    fetch.connect(jest.fn(), jest.fn(), jest.fn(), disconnectCallback).catch(() => {
      // do nothing
    });

    // then
    expect(disconnectCallback).toHaveBeenCalledTimes(1);
    expect(serviceMock.getChannel().getConnectivityState).toHaveBeenCalledWith(true);
    expect(serviceMock.getChannel().watchConnectivityState).toHaveBeenCalled();
  });
});
