import { CallbackClient, Code, ConnectError, PromiseClient } from '@bufbuild/connect';
import { Struct } from '@bufbuild/protobuf';
import { Client, ErrorCode, JsonValue, OpenFeature, ProviderEvents, StandardResolutionReasons } from '@openfeature/web-sdk';
import fetchMock from 'jest-fetch-mock';
import { Service } from '../proto/ts/schema/v1/schema_connect';
import { AnyFlag, EventStreamResponse, ResolveAllResponse } from '../proto/ts/schema/v1/schema_pb';
import { FlagdWebProvider } from './flagd-web-provider';

const EVENT_CONFIGURATION_CHANGE = 'configuration_change';
const EVENT_PROVIDER_READY = 'provider_ready';
const RECONNECT_TIME_LIMIT = 2000; // in very busy test envs, this may fail. We might want to make this 3s

const BOOL_FLAG_KEY = 'boolFlag';
const BOOL_FLAG_VALUE = true;
const BOOL_FLAG_VARIANT = `${BOOL_FLAG_KEY}_variant`;

const STRING_FLAG_KEY = 'stringFlag';
const STRING_FLAG_VALUE = 'string!';
const STRING_FLAG_VARIANT = `${STRING_FLAG_KEY}_variant`;

const NUMBER_FLAG_KEY = 'numberFlag';
const NUMBER_FLAG_VALUE = 99;
const NUMBER_FLAG_VARIANT = `${NUMBER_FLAG_KEY}_variant`;

const OBJECT_FLAG_KEY = 'objectFlag';
const OBJECT_FLAG_VALUE = { foo: 'bar' };
const OBJECT_FLAG_VARIANT = `${OBJECT_FLAG_KEY}_variant`;

class MockCallbackClient implements Partial<CallbackClient<typeof Service>> {
  private messageCallback?: (response: EventStreamResponse) => void;
  private closeCallback?: (error: ConnectError) => void;

  /**
   * allows connection failure mocking
   */
  fail = false;

  // use to fire an incoming mock message
  mockMessage(message: Partial<EventStreamResponse>) {
    this.messageCallback?.(message as EventStreamResponse);
  }

  // use to fire a mock connection close
  mockClose(error: Partial<ConnectError>) {
    this.closeCallback?.(error as ConnectError);
  }

  // cancel function stub to make assertions against
  cancelFunction = jest.fn(() => undefined);

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

      return this.cancelFunction;
    }
  );
}

class MockPromiseClient implements Partial<PromiseClient<typeof Service>> {
  resolveAll = jest.fn(() => {
    const result: ResolveAllResponse = {
      flags: {
        [BOOL_FLAG_KEY]: {
          reason: StandardResolutionReasons.STATIC,
          variant: BOOL_FLAG_VARIANT,
          value: {
            case: 'boolValue',
            value: BOOL_FLAG_VALUE,
          },
        } as AnyFlag,
        [STRING_FLAG_KEY]: {
          reason: StandardResolutionReasons.STATIC,
          variant: STRING_FLAG_VARIANT,
          value: {
            case: 'stringValue',
            value: STRING_FLAG_VALUE,
          },
        } as AnyFlag,
        [NUMBER_FLAG_KEY]: {
          reason: StandardResolutionReasons.STATIC,
          variant: NUMBER_FLAG_VARIANT,
          value: {
            case: 'doubleValue',
            value: NUMBER_FLAG_VALUE,
          },
        } as AnyFlag,
        [OBJECT_FLAG_KEY]: {
          reason: StandardResolutionReasons.STATIC,
          variant: OBJECT_FLAG_VARIANT,
          value: {
            case: 'objectValue',
            value: Struct.fromJson(OBJECT_FLAG_VALUE),
          },
        } as AnyFlag,
      },
    } as unknown as ResolveAllResponse;
    return Promise.resolve(result);
  });
}

describe(FlagdWebProvider.name, () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('resolution functionality', () => {
    let client: Client;
    beforeAll((done) => {
      const mockCallbackClient = new MockCallbackClient();
      const provider = new FlagdWebProvider(
        { host: 'fake.com' },
        console,
        new MockPromiseClient() as unknown as PromiseClient<typeof Service>,
        mockCallbackClient as unknown as CallbackClient<typeof Service>
      );
      OpenFeature.setProvider(provider);
      client = OpenFeature.getClient('resolution functionality test');

      client.addHandler(ProviderEvents.Ready, () => {
        done();
      });
      mockCallbackClient.mockMessage({
        type: EVENT_PROVIDER_READY,
      });
    });

    it(FlagdWebProvider.prototype.resolveBooleanEvaluation.name, async () => {
      const details = client.getBooleanDetails(BOOL_FLAG_KEY, false);
      expect(details.value).toEqual(BOOL_FLAG_VALUE);
      expect(details.variant).toEqual(BOOL_FLAG_VARIANT);
      expect(details.reason).toEqual(StandardResolutionReasons.STATIC);
    });

    it(FlagdWebProvider.prototype.resolveStringEvaluation.name, async () => {
      const details = client.getStringDetails(STRING_FLAG_KEY, 'nope!');
      expect(details.value).toEqual(STRING_FLAG_VALUE);
      expect(details.variant).toEqual(STRING_FLAG_VARIANT);
      expect(details.reason).toEqual(StandardResolutionReasons.STATIC);
    });

    it(FlagdWebProvider.prototype.resolveNumberEvaluation.name, async () => {
      const details = client.getNumberDetails(NUMBER_FLAG_KEY, 0);
      expect(details.value).toEqual(NUMBER_FLAG_VALUE);
      expect(details.variant).toEqual(NUMBER_FLAG_VARIANT);
      expect(details.reason).toEqual(StandardResolutionReasons.STATIC);
    });

    it(FlagdWebProvider.prototype.resolveObjectEvaluation.name, async () => {
      const details = client.getObjectDetails(OBJECT_FLAG_KEY, { food: 'bars' });
      expect(details.value).toEqual(OBJECT_FLAG_VALUE);
      expect(details.variant).toEqual(OBJECT_FLAG_VARIANT);
      expect(details.reason).toEqual(StandardResolutionReasons.STATIC);
    });
  });

  describe('events', () => {
    let client: Client;
    let mockCallbackClient: MockCallbackClient;
    const mockPromiseClient = new MockPromiseClient() as unknown as PromiseClient<typeof Service>;
    const context = { some: 'value' };

    beforeEach(() => {
      mockCallbackClient = new MockCallbackClient();
      OpenFeature.setProvider(
        new FlagdWebProvider(
          { host: 'fake.com', maxRetries: -1 },
          console,
          mockPromiseClient,
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

      it('should trigger call to resolveAll with current context', (done) => {

        client.addHandler(ProviderEvents.ConfigurationChanged, () => {
          try {
            expect(mockPromiseClient.resolveAll).toHaveBeenLastCalledWith({context: Struct.fromJson(context as JsonValue)});
            done();
          } catch(err) {
            done(err);
          }
        });
        OpenFeature.setContext(context).then(() => {
          mockCallbackClient.mockMessage({
            type: EVENT_CONFIGURATION_CHANGE,
          });
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

  describe('shutdown', () => {
    let client: Client;
    let mockCallbackClient: MockCallbackClient;
    const mockPromiseClient = new MockPromiseClient() as unknown as PromiseClient<typeof Service>;
    const context = { some: 'value' };

    beforeEach(() => {
      mockCallbackClient = new MockCallbackClient();
      OpenFeature.setProvider(
        new FlagdWebProvider(
          { host: 'fake.com', maxRetries: -1 },
          console,
          mockPromiseClient,
          mockCallbackClient as unknown as CallbackClient<typeof Service>
        )
      );
      client = OpenFeature.getClient('events-test');
    });

    describe('API close', () => {
      it('should call cancel function on provider', () => {
        expect(mockCallbackClient.cancelFunction).not.toHaveBeenCalled();
        OpenFeature.close();
        expect(mockCallbackClient.cancelFunction).toHaveBeenCalled();
      });
    });
  });

  describe('reconnect logic', () => {
    describe('Infinite maxRetries', () => {
      it('should attempt reconnect many times', (done) => {
        const mockCallbackClient = new MockCallbackClient();
        OpenFeature.setProvider(
          new FlagdWebProvider(
            { host: 'fake.com' },
            console,
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
      it('should attempt reconnect if maxRetries (1) times', (done) => {
        const mockCallbackClient = new MockCallbackClient();
        OpenFeature.setProvider(
          new FlagdWebProvider(
            { host: 'fake.com', maxRetries: 1 },
            console,
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
            expect(mockCallbackClient.eventStream.mock.calls.length).toEqual(2); // initial + 1 retry
            done();
          } catch (err) {
            done(err);
          }
        }, RECONNECT_TIME_LIMIT);
      });

      it('should NOT attempt reconnect if maxRetries (-1) times', (done) => {
        const mockCallbackClient = new MockCallbackClient();
        OpenFeature.setProvider(
          new FlagdWebProvider(
            { host: 'fake.com', maxRetries: -1 },
            console,
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
            expect(mockCallbackClient.eventStream.mock.calls.length).toEqual(1); // initial only
            done();
          } catch (err) {
            done(err);
          }
        }, RECONNECT_TIME_LIMIT);
      });
    });
  });

  describe('common errors', () => {
    let client: Client;
    beforeAll((done) => {
      const mockCallbackClient = new MockCallbackClient();
      const provider = new FlagdWebProvider(
        { host: 'fake.com' },
        console,
        new MockPromiseClient() as unknown as PromiseClient<typeof Service>,
        mockCallbackClient as unknown as CallbackClient<typeof Service>
      );
      OpenFeature.setProvider(provider);
      client = OpenFeature.getClient('resolution functionality test');

      client.addHandler(ProviderEvents.Ready, () => {
        done();
      });
      mockCallbackClient.mockMessage({
        type: EVENT_PROVIDER_READY,
      });
    });

    afterEach(() => {
      fetchMock.resetMocks();
    });

    describe(ErrorCode.FLAG_NOT_FOUND, () => {
      const key = 'not-found-key';
      const defaultValue = 'not-found-value';
      it(FlagdWebProvider.prototype.resolveBooleanEvaluation.name, async () => {
        const details = client.getStringDetails(key, defaultValue);
        expect(details.value).toEqual(defaultValue);
        expect(details.reason).toEqual(StandardResolutionReasons.ERROR);
        expect(details.errorCode).toEqual(ErrorCode.FLAG_NOT_FOUND);
        expect(details.errorMessage).toBeTruthy();
      });
    });

    describe(ErrorCode.TYPE_MISMATCH, () => {
      const defaultValue = 111;
      it(FlagdWebProvider.prototype.resolveBooleanEvaluation.name, async () => {
        const details = client.getNumberDetails(BOOL_FLAG_KEY, defaultValue);
        expect(details.value).toEqual(defaultValue);
        expect(details.reason).toEqual(StandardResolutionReasons.ERROR);
        expect(details.errorCode).toEqual(ErrorCode.TYPE_MISMATCH);
        expect(details.errorMessage).toBeTruthy();
      });
    });
  });
});
