import { GrpcFetch } from './grpc-fetch';
import type { FlagdGrpcConfig } from '../../../configuration';
import type { FlagSyncServiceClient, SyncFlagsResponse } from '../../../../proto/ts/flagd/sync/v1/sync';
import { ConnectivityState } from '@grpc/grpc-js/build/src/connectivity-state';
import type { Metadata } from '@grpc/grpc-js';
import { FLAGD_SELECTOR_HEADER } from '../../../constants';

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
const setSyncContext = jest.fn();

let onDataCallback: (data: SyncFlagsResponse) => void = () => ({});
let onErrorCallback: (err: Error) => void = () => ({});

const serviceMock: FlagSyncServiceClient = {
  getChannel: jest.fn(() => {
    return mockChannel;
  }),
  waitForReady: jest.fn((_deadline: number, callback: (err?: Error) => void) => {
    callback();
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
  const cfg: FlagdGrpcConfig = {
    deadlineMs: 500,
    host: 'localhost',
    port: 8000,
    tls: false,
    socketPath: '',
    defaultAuthority: 'test-authority',
    streamDeadlineMs: 600000,
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should handle data sync and emit callbacks', (done) => {
    const flagConfiguration = '{"flags":{}}';
    const fetch = new GrpcFetch(cfg, setSyncContext, serviceMock);
    fetch
      .connect(dataCallback, reconnectCallback, jest.fn(), disconnectCallback)
      .then(() => {
        try {
          expect(setSyncContext).toHaveBeenCalledTimes(0);
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

  it('should handle SyncContext from SyncFlagsResponse', (done) => {
    const initFlagConfig = '{"flags":{}}';
    const syncContext = { test: 'example' };

    const fetch = new GrpcFetch(cfg, setSyncContext, serviceMock);
    fetch
      .connect(dataCallback, reconnectCallback, changedCallback, disconnectCallback)
      .then(() => {
        try {
          // Callback assertions
          expect(setSyncContext).toHaveBeenCalledTimes(1);
          expect(setSyncContext).toHaveBeenCalledWith(syncContext);

          done();
        } catch (err) {
          done(err);
        }
      })
      .catch((err) => {
        done(err);
      });

    // First connection
    onDataCallback({ flagConfiguration: initFlagConfig, syncContext: syncContext });
  });

  it('should handle data sync reconnection', (done) => {
    const initFlagConfig = '{"flags":{}}';
    const updatedFlagConfig =
      '{"flags":{"test":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"off"}}}';
    const reconnectFlagConfig =
      '{"flags":{"test":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"on"}}}';

    const fetch = new GrpcFetch(cfg, jest.fn(), serviceMock);
    fetch
      .connect(dataCallback, reconnectCallback, changedCallback, disconnectCallback)
      .then(() => {
        try {
          // Updated flags
          onDataCallback({ flagConfiguration: updatedFlagConfig });
          // Stream error
          onErrorCallback(new Error('Some connection error'));
          // Run timers to trigger reconnect via setTimeout
          jest.runAllTimers();
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

  it('should handle error and attempt to reconnect', (done) => {
    const fetch = new GrpcFetch(cfg, jest.fn(), serviceMock);
    fetch.connect(jest.fn(), jest.fn(), jest.fn(), disconnectCallback).catch((err) => {
      try {
        expect(err).toBeInstanceOf(Error);
        expect(disconnectCallback).toHaveBeenCalledTimes(1);
        done();
      } catch (err) {
        done(err);
      }
    });

    onErrorCallback(new Error('Some connection error'));
  });

  it('should send selector via flagd-selector metadata header', async () => {
    const selector = 'app=weather';
    const cfgWithSelector: FlagdGrpcConfig = { ...cfg, selector };
    const flagConfiguration = '{"flags":{}}';

    const fetch = new GrpcFetch(cfgWithSelector, setSyncContext, serviceMock);
    const connectPromise = fetch.connect(dataCallback, reconnectCallback, jest.fn(), disconnectCallback);
    onDataCallback({ flagConfiguration });
    await connectPromise;

    // Verify syncFlags was called
    expect(serviceMock.syncFlags).toHaveBeenCalled();

    // Check that request, metadata, and options were passed
    const callArgs = (serviceMock.syncFlags as jest.Mock).mock.calls[0];
    expect(callArgs).toHaveLength(3);

    // Verify the request contains selector (for backward compatibility)
    expect(callArgs[0].selector).toBe(selector);

    // Verify the metadata contains flagd-selector header
    const metadata = callArgs[1] as Metadata;
    expect(metadata).toBeDefined();
    expect(metadata.get(FLAGD_SELECTOR_HEADER)).toEqual([selector]);
  });

  it('should handle empty selector gracefully', async () => {
    const cfgWithoutSelector: FlagdGrpcConfig = { ...cfg, selector: '' };
    const flagConfiguration = '{"flags":{}}';

    const fetch = new GrpcFetch(cfgWithoutSelector, setSyncContext, serviceMock);
    const connectPromise = fetch.connect(dataCallback, reconnectCallback, jest.fn(), disconnectCallback);
    onDataCallback({ flagConfiguration });
    await connectPromise;

    // Verify syncFlags was called
    expect(serviceMock.syncFlags).toHaveBeenCalled();

    // Check that request, metadata, and options were passed
    const callArgs = (serviceMock.syncFlags as jest.Mock).mock.calls[0];
    expect(callArgs).toHaveLength(3);

    // Verify the request contains empty selector
    expect(callArgs[0].selector).toBe('');

    // Verify the metadata does not contain flagd-selector header
    const metadata = callArgs[1] as Metadata;
    expect(metadata).toBeDefined();
    expect(metadata.get(FLAGD_SELECTOR_HEADER)).toEqual([]);
  });
});
