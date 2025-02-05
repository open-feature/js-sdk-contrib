import { GrpcFetch } from './grpc-fetch';
import { Config } from '../../../configuration';
import { FlagSyncServiceClient, SyncFlagsResponse } from '../../../../proto/ts/flagd/sync/v1/sync';
import { ConnectivityState } from '@grpc/grpc-js/build/src/connectivity-state';

let watchStateCallback: () => void = () => ({});
const mockChannel = {
  getConnectivityState: jest.fn(() => ConnectivityState.READY),
  watchConnectivityState: jest.fn((state, retry, cb) => {
    watchStateCallback = cb;
  }),
};

const dataCallback = jest.fn();
const reconnectCallback = jest.fn();
const changedCallback = jest.fn();
const disconnectCallback = jest.fn();
const removeAllListeners = jest.fn();
const cancel = jest.fn();
const destroy = jest.fn();

let onDataCallback: (data: SyncFlagsResponse) => void = () => ({});
let onErrorCallback: (err: Error) => void = () => ({});

const serviceMock: FlagSyncServiceClient = {
  getChannel: jest.fn(() => {
    return mockChannel;
  }),
  syncFlags: jest.fn(() => {
    return {
      on: jest.fn((event: 'data' | 'error', callback: (data: SyncFlagsResponse | Error) => void) => {
        if (event === 'data') {
          onDataCallback = callback;
        } else if (event === 'error') {
          onErrorCallback = callback;
        }
        return {};
      }),
      removeAllListeners,
      cancel,
      destroy,
    };
  }),
} as unknown as FlagSyncServiceClient;

describe('grpc fetch', () => {
  const cfg: Config = { host: 'localhost', port: 8000, tls: false, socketPath: '', defaultAuthority: 'test-authority' };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle data sync and emit callbacks', (done) => {
    const flagConfiguration = '{"flags":{}}';
    const fetch = new GrpcFetch(cfg, serviceMock);
    fetch
      .connect(dataCallback, reconnectCallback, jest.fn(), disconnectCallback)
      .then(() => {
        try {
          expect(dataCallback).toHaveBeenCalledTimes(1);
          expect(dataCallback).toHaveBeenCalledWith(flagConfiguration);
          expect(changedCallback).toHaveBeenCalledTimes(0);
          expect(disconnectCallback).toHaveBeenCalledTimes(0);
          done();
        } catch (err) {
          done(err);
        }
      })
      .catch((err) => {
        done(err);
      });

    onDataCallback({ flagConfiguration });
  });

  it('should handle data sync reconnection', (done) => {
    const initFlagConfig = '{"flags":{}}';
    const updatedFlagConfig =
      '{"flags":{"test":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"off"}}}';
    const reconnectFlagConfig =
      '{"flags":{"test":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"on"}}}';

    const fetch = new GrpcFetch(cfg, serviceMock);
    fetch
      .connect(dataCallback, reconnectCallback, changedCallback, disconnectCallback)
      .then(() => {
        try {
          // Updated flags
          onDataCallback({ flagConfiguration: updatedFlagConfig });
          // Stream error
          onErrorCallback(new Error('Some connection error'));
          // Force clearing
          watchStateCallback();
          // Reconnect
          onDataCallback({ flagConfiguration: reconnectFlagConfig });

          // Callback assertions
          expect(dataCallback).toHaveBeenCalledTimes(3);
          expect(changedCallback).toHaveBeenCalledTimes(2);
          expect(disconnectCallback).toHaveBeenCalledTimes(1);
          expect(reconnectCallback).toHaveBeenCalledTimes(1);

          // Expects old stream to have been cleaned up.
          expect(removeAllListeners).toHaveBeenCalledTimes(1);
          expect(destroy).toHaveBeenCalledTimes(1);
          expect(cancel).toHaveBeenCalledTimes(1);

          done();
        } catch (err) {
          done(err);
        }
      })
      .catch((err) => {
        done(err);
      });

    dataCallback.mockReturnValue(['test']);

    // First connection
    onDataCallback({ flagConfiguration: initFlagConfig });
  });

  it('should handle error and watch channel for reconnect', (done) => {
    const fetch = new GrpcFetch(cfg, serviceMock);
    fetch.connect(jest.fn(), jest.fn(), jest.fn(), disconnectCallback).catch((err) => {
      try {
        expect(err).toBeInstanceOf(Error);
        expect(disconnectCallback).toHaveBeenCalledTimes(1);
        expect(serviceMock.getChannel().getConnectivityState).toHaveBeenCalledWith(true);
        expect(serviceMock.getChannel().watchConnectivityState).toHaveBeenCalled();
        done();
      } catch (err) {
        done(err);
      }
    });

    onErrorCallback(new Error('Some connection error'));
  });
});
