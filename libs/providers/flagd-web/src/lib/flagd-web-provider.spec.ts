import { CallbackClient, Code, codeToString, ConnectError } from '@bufbuild/connect-web';
import { Client, ErrorCode, OpenFeature, ProviderEvents, StandardResolutionReasons } from '@openfeature/js-sdk';
import fetchMock from 'jest-fetch-mock';
import { Service } from '../proto/ts/schema/v1/schema_connectweb';
import { EventStreamResponse } from '../proto/ts/schema/v1/schema_pb';
import { FlagdCache } from './flagd-cache';
import { FlagdWebProvider } from './flagd-web-provider';

const HEADERS = {
  'Content-Type': 'application/json',
};

const EVENT_CONFIGURATION_CHANGE = 'configuration_change';
const EVENT_PROVIDER_READY = 'provider_ready';
const RECONNECT_TIME_LIMIT = 2000; // in very busy test envs, this may fail. We might want to make this 3s
OpenFeature.events.setMaxListeners(1000);

class MockCallbackClient implements Partial<CallbackClient<typeof Service>> {
  private messageCallback?: (response: EventStreamResponse) => void;
  private closeCallback?: (error: ConnectError) => void;

  /**
   * allows connection failure mocking
   */
  fail = false;

  mockMessage(message: Partial<EventStreamResponse>) {
    this.messageCallback?.(message as EventStreamResponse);
  }

  mockClose(error: Partial<ConnectError>) {
    this.closeCallback?.(error as ConnectError);
  }

  eventStream = jest.fn(
    (
      _,
      messageCallback: (response: EventStreamResponse) => void,
      closeCallback: (error: ConnectError) => void
    ): (() => void) => {
      this.messageCallback = messageCallback;
      this.closeCallback = closeCallback;

      // if fail is set, close immediately
      if (this.fail) {
        setTimeout(() => this.closeCallback?.({ code: Code.Unavailable } as unknown as ConnectError), 0);
      }

      return () => undefined;
    }
  );
}

describe(FlagdWebProvider.name, () => {
  describe('resolution functionality', () => {
    fetchMock.enableMocks();

    let client: Client;
    beforeEach(() => {
      const provider = new FlagdWebProvider({ eventStreaming: false });
      OpenFeature.setProvider(provider);
      client = OpenFeature.getClient('test');
    });

    afterEach(() => {
      fetchMock.resetMocks();
    });

    it(FlagdWebProvider.prototype.resolveBooleanEvaluation.name, async () => {
      const flagKey = 'boolFlag';
      fetchMock.mockResponseOnce(
        JSON.stringify({
          variant: 'success',
          value: true,
          reason: StandardResolutionReasons.DEFAULT,
        }),
        { headers: HEADERS }
      );
      const res = await client.getBooleanValue(flagKey, false).catch((err) => {
        expect(err).toBeUndefined();
      });
      expect(res).toEqual(true);
    });

    it(FlagdWebProvider.prototype.resolveStringEvaluation.name, async () => {
      const flagKey = 'stringFlag';
      fetchMock.mockResponseOnce(
        JSON.stringify({
          variant: 'success',
          value: 'true',
          reason: StandardResolutionReasons.DEFAULT,
        }),
        { headers: HEADERS }
      );
      const res = await client.getStringValue(flagKey, 'false').catch((err) => {
        expect(err).toBeUndefined();
      });
      expect(res).toEqual('true');
    });

    it(FlagdWebProvider.prototype.resolveNumberEvaluation.name, async () => {
      const flagKey = 'numberFlag';
      fetchMock.mockResponseOnce(
        JSON.stringify({
          variant: 'success',
          value: 1,
          reason: StandardResolutionReasons.DEFAULT,
        }),
        { headers: HEADERS }
      );
      const res = await client.getNumberValue(flagKey, 0).catch((err) => {
        expect(err).toBeUndefined();
      });
      expect(res).toEqual(1);
    });

    it(FlagdWebProvider.prototype.resolveObjectEvaluation.name, async () => {
      const flagKey = 'objectFlag';
      fetchMock.mockResponseOnce(
        JSON.stringify({
          variant: 'success',
          value: { foo: 'bar' },
          reason: StandardResolutionReasons.DEFAULT,
        }),
        { headers: HEADERS }
      );
      const res = await client.getObjectValue(flagKey, { food: 'bars' }).catch((err) => {
        expect(err).toBeUndefined();
      });
      expect(res).toEqual({ foo: 'bar' });
    });
  });

  describe('events-enabled', () => {
    let client: Client;
    const mockCallbackClient = new MockCallbackClient();

    beforeEach(() => {
      OpenFeature.setProvider(
        new FlagdWebProvider(
          { caching: false },
          console,
          undefined,
          undefined,
          mockCallbackClient as unknown as CallbackClient<typeof Service>
        )
      );
      client = OpenFeature.getClient('events-test');
    });

    describe(ProviderEvents.Ready, () => {
      it('should be fired as soon as client subscribes, if ready', (done) => {
        mockCallbackClient.mockMessage({
          type: EVENT_PROVIDER_READY,
        });

        client.addHandler(ProviderEvents.Ready, () => {
          done();
        });
      });

      it('should fire if message received', (done) => {
        client.addHandler(ProviderEvents.Ready, () => {
          done();
        });
        mockCallbackClient.mockMessage({
          type: EVENT_PROVIDER_READY,
        });
      });
    });

    describe(ProviderEvents.ConfigurationChanged, () => {
      it('should fire if message received', (done) => {
        client.addHandler(ProviderEvents.ConfigurationChanged, () => {
          done();
        });
        mockCallbackClient.mockMessage({
          type: EVENT_CONFIGURATION_CHANGE,
        });
      });
    });

    describe(ProviderEvents.Error, () => {
      it('should fire if message received', (done) => {
        client.addHandler(ProviderEvents.Error, () => {
          done();
        });
        mockCallbackClient.mockClose({
          code: Code.Unavailable,
        });
      });
    });
  });

  describe('reconnect logic', () => {
    describe('Infinite maxRetries', () => {
      it('should attempt reconnect many times', (done) => {
        const mockCallbackClient = new MockCallbackClient();
        OpenFeature.setProvider(
          new FlagdWebProvider(
            {},
            console,
            undefined,
            undefined,
            mockCallbackClient as unknown as CallbackClient<typeof Service>
          )
        );
        mockCallbackClient.fail = true;
        mockCallbackClient.mockClose({
          code: Code.Unavailable,
        });
        setTimeout(() => {
          try {
            expect(mockCallbackClient.eventStream.mock.calls.length).toBeGreaterThanOrEqual(3);
            done();
          } catch (err) {
            done(err);
          }
        }, RECONNECT_TIME_LIMIT);
      });
    });

    describe('finite maxRetries', () => {
      it('should attempt reconnect maxRetries (2) times', (done) => {
        const mockCallbackClient = new MockCallbackClient();
        OpenFeature.setProvider(
          new FlagdWebProvider(
            { maxRetries: 2 },
            console,
            undefined,
            undefined,
            mockCallbackClient as unknown as CallbackClient<typeof Service>
          )
        );

        mockCallbackClient.fail = true;
        mockCallbackClient.mockClose({
          code: Code.Unavailable,
        });
        setTimeout(() => {
          try {
            expect(mockCallbackClient.eventStream.mock.calls.length).toEqual(2);
            done();
          } catch (err) {
            done(err);
          }
        }, RECONNECT_TIME_LIMIT);
      });
    });
  });

  describe('caching logic', () => {
    const flagKey = 'cacheFlag';
    fetchMock.enableMocks();

    afterEach(() => {
      fetchMock.resetMocks();
    });

    describe('resolution details cached', () => {
      it('should return from cache', async () => {
        const value = 'stale';
        const variant = 'cached';
        const mockCache = {
          set: jest.fn(() => Promise.resolve()),
          get: jest.fn(() =>
            Promise.resolve({
              variant,
              value,
              reason: StandardResolutionReasons.CACHED,
            })
          ),
        } as unknown as FlagdCache;

        const provider = new FlagdWebProvider({ eventStreaming: false, caching: true }, console, mockCache);
        OpenFeature.setProvider(provider);
        const client = OpenFeature.getClient('test');

        const details = await client.getStringDetails(flagKey, 'false');
        expect(details.value).toEqual(value);
        expect(details.variant).toEqual(variant);
        expect(details.reason).toEqual(StandardResolutionReasons.CACHED);
        expect(mockCache.get).toHaveBeenCalled();
      });
    });

    describe('resolution details not cached', () => {
      it('should save in cache', async () => {
        const value = 'shiny';
        const variant = 'new';
        const mockCache = {
          set: jest.fn(() => Promise.resolve()),
          get: jest.fn(() => Promise.resolve()),
        } as unknown as FlagdCache;

        const provider = new FlagdWebProvider({ eventStreaming: false, caching: true }, console, mockCache);
        OpenFeature.setProvider(provider);
        const client = OpenFeature.getClient('test');

        fetchMock.mockResponseOnce(
          JSON.stringify({
            variant,
            value,
            reason: StandardResolutionReasons.DEFAULT,
          }),
          { headers: HEADERS }
        );

        const details = await client.getStringDetails(flagKey, 'false');
        expect(details.value).toEqual(value);
        expect(details.variant).toEqual(variant);
        expect(details.reason).toEqual(StandardResolutionReasons.DEFAULT);
        expect(mockCache.set).toHaveBeenCalledWith(
          flagKey,
          {},
          expect.objectContaining({
            variant,
            value,
          })
        );
      });
    });
  });

  describe('common errors', () => {
    let client: Client;

    beforeEach(() => {
      const provider = new FlagdWebProvider({ eventStreaming: false });
      OpenFeature.setProvider(provider);
      client = OpenFeature.getClient('test');
    });

    afterEach(() => {
      fetchMock.resetMocks();
    });

    it('flag not found', async () => {
      const flagKey = 'notBoolFlag';
      fetchMock.mockResponseOnce(
        JSON.stringify({
          code: codeToString(Code.NotFound),
          message: '',
        }),
        {
          headers: HEADERS,
          status: 404,
        }
      );
      const res = await client.getBooleanDetails(flagKey, false).catch((err) => {
        expect(err).toBeUndefined();
      });
      if (res) {
        expect(res.reason).toEqual(StandardResolutionReasons.ERROR);
        expect(res.errorCode).toEqual(ErrorCode.FLAG_NOT_FOUND);
      } else {
        expect(res).not.toBeNull();
      }
    });

    it('type mismatch', async () => {
      const flagKey = 'BoolFlag';
      fetchMock.mockResponseOnce(
        JSON.stringify({
          code: codeToString(Code.InvalidArgument),
          message: '',
        }),
        {
          headers: HEADERS,
          status: 400,
        }
      );
      const res = await client.getStringDetails(flagKey, '').catch((err) => {
        expect(err).toBeUndefined();
      });
      if (res) {
        expect(res.reason).toEqual(StandardResolutionReasons.ERROR);
        expect(res.errorCode).toEqual(ErrorCode.TYPE_MISMATCH);
      } else {
        expect(res).not.toBeNull();
      }
    });

    it('disabled', async () => {
      const flagKey = 'disabledFlag';
      fetchMock.mockResponseOnce(
        JSON.stringify({
          code: codeToString(Code.Unavailable),
          message: '',
        }),
        {
          headers: HEADERS,
          status: 400,
        }
      );
      const res = await client.getStringDetails(flagKey, '').catch((err) => {
        expect(err).toBeUndefined();
      });
      if (res) {
        expect(res.reason).toEqual(StandardResolutionReasons.ERROR);
        expect(res.errorCode).toEqual(ErrorCode.GENERAL);
      } else {
        expect(res).not.toBeNull();
      }
    });

    it('parse error', async () => {
      const flagKey = 'parseFailure';
      fetchMock.mockResponseOnce(
        JSON.stringify({
          code: codeToString(Code.DataLoss),
          message: '',
        }),
        {
          headers: HEADERS,
          status: 400,
        }
      );
      const res = await client.getStringDetails(flagKey, '').catch((err) => {
        expect(err).toBeUndefined();
      });
      if (res) {
        expect(res.reason).toEqual(StandardResolutionReasons.ERROR);
        expect(res.errorCode).toEqual(ErrorCode.PARSE_ERROR);
      } else {
        expect(res).not.toBeNull();
      }
    });
  });
});
