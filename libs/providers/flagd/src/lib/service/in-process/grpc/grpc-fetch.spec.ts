import { GrpcFetch, initBackOffMs } from './grpc-fetch';
import { Config } from '../../../configuration';
import {
  FlagSyncServiceClient,
  SyncFlagsRequest,
  SyncFlagsResponse,
  SyncState
} from '../../../../proto/ts/sync/v1/sync_service';

describe('grpc fetch', () => {
  const cfg: Config = { host: 'localhost', port: 8000, tls: false, socketPath: '' };

  it('should handle data sync and emit callbacks', () => {
    // given
    const flagResponse = '{"flags":{}}';

    const serviceMock: FlagSyncServiceClient = {
      syncFlags: jest.fn((_: SyncFlagsRequest) => {
        return {
          // mock event registration callback response
          on: jest.fn((event: string, callback: (data: SyncFlagsResponse) => void) => {
            if (event === 'data') {
              callback({
                flagConfiguration: flagResponse,
                state: SyncState.SYNC_STATE_ALL
              });
            }
            return {};
          })
        };
      })

    } as unknown as FlagSyncServiceClient;

    let callBackResponse = '';

    const dataFillCallback = jest.fn((flags: string) => {
      callBackResponse = flags;
    });
    const connectCallback = jest.fn();
    const disconnectCallback = jest.fn();

    // when
    const fetch = new GrpcFetch(cfg, serviceMock);
    fetch.connect(dataFillCallback, connectCallback, jest.fn(), disconnectCallback);

    // then
    expect(dataFillCallback).toBeCalledTimes(1);
    expect(connectCallback).toBeCalledTimes(1);
    expect(disconnectCallback).toBeCalledTimes(0);
    expect(callBackResponse).toBe(flagResponse);
  });

  it('should handle error and attempt to reconnect', (done) => {
    // given
    const serviceMock: FlagSyncServiceClient = {
      syncFlags: jest.fn((_: SyncFlagsRequest) => {
        return {
          on: jest.fn((event: string, callback: (err: Error) => void) => {
            if (event === 'error') {
              callback(new Error('Some connection error'));
            }
            return {};
          })
        };
      })

    } as unknown as FlagSyncServiceClient;

    const disconnectCallback = jest.fn();

    // when
    const fetch = new GrpcFetch(cfg, serviceMock);
    fetch.connect(jest.fn(), jest.fn(), jest.fn(), disconnectCallback);

    // then
    expect(disconnectCallback).toBeCalledTimes(1);

    // wait for initial backoff
    setTimeout(() => {
      expect(disconnectCallback).toBeCalledTimes(2);
      done();
    }, initBackOffMs);
  });

});
