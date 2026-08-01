import { GoFeatureFlagWebProvider } from './go-feature-flag-web-provider';
import type { EvaluationContext, EvaluationDetails, JsonValue } from '@openfeature/web-sdk';
import { ErrorCode, OpenFeature, ProviderEvents, StandardResolutionReasons } from '@openfeature/web-sdk';
import WS from 'jest-websocket-mock';
import { TestLogger } from '../spec-utils';
import type {
  DataCollectorRequest,
  GoFeatureFlagWebProviderOptions,
  GOFeatureFlagWebsocketResponse,
  TrackingEvent,
} from './model';
import fetchMock from 'fetch-mock-jest';
import { WebSocketFlagChangeStrategy, ServerSentEventFlagChangeStrategy } from './change-strategy';
import { EventSourceMock } from '../spec-utils/mock';
import { awaitableTimeout, whenAnySettle } from './utils';

describe('GoFeatureFlagWebProvider', () => {
  let websocketMockServer: WS;
  const endpoint = 'http://localhost:1031/';
  const allFlagsEndpoint = `${endpoint}v1/allflags`;
  const dataCollectorEndpoint = `${endpoint}v1/data/collector`;
  const websocketEndpoint = 'ws://localhost:1031/stream/v1/ws/flag/change';
  const defaultAllFlagResponse = {
    flags: {
      bool_flag: {
        value: true,
        timestamp: 1689020159,
        variationType: 'True',
        trackEvents: true,
        reason: 'DEFAULT',
        metadata: {
          description: 'this is a test flag',
        },
      },
      number_flag: {
        value: 123,
        timestamp: 1689020159,
        variationType: 'True',
        trackEvents: true,
        reason: 'DEFAULT',
        metadata: {
          description: 'this is a test flag',
        },
      },
      string_flag: {
        value: 'value-flag',
        timestamp: 1689020159,
        variationType: 'True',
        trackEvents: true,
        reason: 'DEFAULT',
        metadata: {
          description: 'this is a test flag',
        },
      },
      object_flag: {
        value: { id: '123' },
        timestamp: 1689020159,
        variationType: 'True',
        trackEvents: true,
        reason: 'DEFAULT',
        metadata: {
          description: 'this is a test flag',
        },
      },
    },
    valid: true,
  };
  const alternativeAllFlagResponse = {
    flags: {
      bool_flag: {
        value: false,
        timestamp: 1689020159,
        variationType: 'NEW_VARIATION',
        trackEvents: false,
        errorCode: '',
        reason: 'TARGETING_MATCH',
        metadata: {
          description: 'this is a test flag',
        },
      },
    },
    valid: true,
  };
  let defaultProvider: GoFeatureFlagWebProvider;
  let defaultProviderSse: GoFeatureFlagWebProvider;
  let defaultContext: EvaluationContext;
  const readyHandler = jest.fn();
  const errorHandler = jest.fn();
  const configurationChangedHandler = jest.fn();
  const staleHandler = jest.fn();
  const logger = new TestLogger();

  beforeAll(() => {
    EventSourceMock.activate();
  });

  beforeEach(async () => {
    WS.clean();
    EventSourceMock.clean();
    await OpenFeature.close();
    fetchMock.mockClear();
    fetchMock.mockReset();
    jest.resetAllMocks();
    websocketMockServer = new WS(websocketEndpoint, { jsonProtocol: true });
    fetchMock.post(allFlagsEndpoint, defaultAllFlagResponse);
    fetchMock.post(dataCollectorEndpoint, 200);
    defaultProvider = new GoFeatureFlagWebProvider(
      {
        endpoint: endpoint,
        apiTimeout: 1000,
        maxRetries: 1,
      },
      logger,
    );
    defaultProviderSse = new GoFeatureFlagWebProvider(
      {
        endpoint: endpoint,
        apiTimeout: 1000,
        maxRetries: 1,
        mode: 'sse',
      },
      logger,
    );
    defaultContext = { targetingKey: 'user-key' };
  });

  afterEach(async () => {
    WS.clean();
    websocketMockServer.close();
    EventSourceMock.closeAll();
    await OpenFeature.close();
    OpenFeature.clearHooks();
    fetchMock.mockClear();
    fetchMock.mockReset();
    await defaultProvider?.onClose();
    jest.resetAllMocks();
    readyHandler.mockReset();
    errorHandler.mockReset();
    configurationChangedHandler.mockReset();
    staleHandler.mockReset();
    logger.reset();
  });

  afterAll(() => {
    EventSourceMock.deactivate();
  });

  function newDefaultProvider(options?: Partial<GoFeatureFlagWebProviderOptions>): GoFeatureFlagWebProvider {
    return new GoFeatureFlagWebProvider(
      Object.assign(
        {},
        {
          endpoint: endpoint,
          apiTimeout: 1000,
          maxRetries: 1,
          disableDataCollection: true,
        },
        options ?? undefined,
      ),
      logger,
    );
  }

  describe('provider metadata', () => {
    it('should be and instance of GoFeatureFlagWebProvider', () => {
      expect(defaultProvider).toBeInstanceOf(GoFeatureFlagWebProvider);
    });
  });

  describe('flag evaluation', () => {
    it('should change evaluation value if context has changed', async () => {
      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait('test-provider', defaultProvider);
      const client = OpenFeature.getClient('test-provider');
      await websocketMockServer.connected;
      await new Promise((resolve) => setTimeout(resolve, 5));

      const got1 = client.getBooleanDetails('bool_flag', false);
      fetchMock.post(allFlagsEndpoint, alternativeAllFlagResponse, { overwriteRoutes: true });
      await OpenFeature.setContext({ targetingKey: '1234' });
      const got2 = client.getBooleanDetails('bool_flag', false);

      expect(got1.value).toEqual(defaultAllFlagResponse.flags.bool_flag.value);
      expect(got1.variant).toEqual(defaultAllFlagResponse.flags.bool_flag.variationType);
      expect(got1.reason).toEqual(defaultAllFlagResponse.flags.bool_flag.reason);

      expect(got2.value).toEqual(alternativeAllFlagResponse.flags.bool_flag.value);
      expect(got2.variant).toEqual(alternativeAllFlagResponse.flags.bool_flag.variationType);
      expect(got2.reason).toEqual(alternativeAllFlagResponse.flags.bool_flag.reason);
    });

    it('should return CACHED as a reason if websocket is not connected', async () => {
      await OpenFeature.setContext(defaultContext);
      const providerName = expect.getState().currentTestName || 'test';
      const provider = newDefaultProvider();
      OpenFeature.setProvider(providerName, provider);
      const client = OpenFeature.getClient(providerName);
      await websocketMockServer.connected;
      // Need to wait before using the mock
      await new Promise((resolve) => setTimeout(resolve, 5));
      websocketMockServer.close();
      // Need to wait before using the mock
      const got = client.getBooleanDetails('bool_flag', false);
      expect(provider.changeStrategy.status).not.toBe('connected');
      expect(got.reason).toEqual(StandardResolutionReasons.CACHED);
    });

    it('should emit an error if we have the wrong credentials', async () => {
      fetchMock.post(allFlagsEndpoint, 401, { overwriteRoutes: true });
      const providerName = expect.getState().currentTestName || 'test';
      await OpenFeature.setContext(defaultContext);
      OpenFeature.setProvider(providerName, newDefaultProvider());
      const client = OpenFeature.getClient(providerName);
      client.addHandler(ProviderEvents.Error, errorHandler);
      // wait the event to be triggered
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(errorHandler).toHaveBeenCalled();
      expect(logger.inMemoryLogger['error'][0]).toEqual(
        'GoFeatureFlagWebProvider: invalid token used to contact GO Feature Flag instance: Error: Request failed with status code 401',
      );
    });

    it('should emit an error if we receive a 404 from GO Feature Flag', async () => {
      fetchMock.post(allFlagsEndpoint, 404, { overwriteRoutes: true });
      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait('test-provider', defaultProvider);
      const client = OpenFeature.getClient('test-provider');
      client.addHandler(ProviderEvents.Ready, readyHandler);
      client.addHandler(ProviderEvents.Error, errorHandler);
      client.addHandler(ProviderEvents.Stale, staleHandler);
      client.addHandler(ProviderEvents.ConfigurationChanged, configurationChangedHandler);
      // wait the event to be triggered
      await awaitableTimeout(5);
      expect(errorHandler).toHaveBeenCalled();
      expect(logger.inMemoryLogger['error']).toContain(
        'GoFeatureFlagWebProvider: impossible to call go-feature-flag relay proxy Error: Request failed with status code 404',
      );
    });

    it('should get a valid boolean flag evaluation', async () => {
      const flagKey = 'bool_flag';
      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait('test-provider', defaultProvider);
      const client = OpenFeature.getClient('test-provider');
      await websocketMockServer.connected;
      const got = client.getBooleanDetails(flagKey, false);
      const want: EvaluationDetails<boolean> = {
        flagKey,
        value: true,
        variant: 'True',
        flagMetadata: {
          description: 'this is a test flag',
        },
        reason: StandardResolutionReasons.DEFAULT,
      };
      expect(got).toEqual(want);
    });

    it('should get a valid string flag evaluation', async () => {
      const flagKey = 'string_flag';
      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait('test-provider', defaultProvider);
      const client = OpenFeature.getClient('test-provider');
      await websocketMockServer.connected;
      const got = client.getStringDetails(flagKey, 'false');
      const want: EvaluationDetails<string> = {
        flagKey,
        value: 'value-flag',
        variant: 'True',
        flagMetadata: {
          description: 'this is a test flag',
        },
        reason: StandardResolutionReasons.DEFAULT,
      };
      expect(got).toEqual(want);
    });

    it('should get a valid number flag evaluation', async () => {
      const flagKey = 'number_flag';
      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait('test-provider', defaultProvider);
      const client = OpenFeature.getClient('test-provider');
      await websocketMockServer.connected;
      const got = client.getNumberDetails(flagKey, 456);
      const want: EvaluationDetails<number> = {
        flagKey,
        value: 123,
        variant: 'True',
        flagMetadata: {
          description: 'this is a test flag',
        },
        reason: StandardResolutionReasons.DEFAULT,
      };
      expect(got).toEqual(want);
    });

    it('should get a valid object flag evaluation', async () => {
      const flagKey = 'object_flag';
      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait('test-provider', defaultProvider);
      const client = OpenFeature.getClient('test-provider');
      await websocketMockServer.connected;
      const got = client.getObjectDetails(flagKey, { error: true });
      const want: EvaluationDetails<JsonValue> = {
        flagKey,
        value: { id: '123' },
        variant: 'True',
        flagMetadata: {
          description: 'this is a test flag',
        },
        reason: StandardResolutionReasons.DEFAULT,
      };
      expect(got).toEqual(want);
    });

    it('should get an error if evaluate a boolean flag with a string function', async () => {
      const flagKey = 'bool_flag';
      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait('test-provider', defaultProvider);
      const client = OpenFeature.getClient('test-provider');
      await websocketMockServer.connected;
      const got = client.getStringDetails(flagKey, 'false');
      const want: EvaluationDetails<string> = {
        flagKey,
        value: 'false',
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
        flagMetadata: {},
        errorMessage: 'flag key bool_flag is not of type string',
      };
      expect(got).toEqual(want);
    });

    it('should get an error if flag does not exists', async () => {
      const flagKey = 'not-exist';
      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait('test-provider', defaultProvider);
      const client = OpenFeature.getClient('test-provider');
      await websocketMockServer.connected;
      const got = client.getBooleanDetails(flagKey, false);
      const want: EvaluationDetails<boolean> = {
        flagKey,
        value: false,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        flagMetadata: {},
        errorMessage: 'flag key not-exist not found in cache',
      };
      expect(got).toEqual(want);
    });

    it('should have apiKey as header if set in the provider', async () => {
      const apiKeyProvider = new GoFeatureFlagWebProvider(
        {
          endpoint: endpoint,
          apiTimeout: 1000,
          maxRetries: 1,
          apiKey: 'my-api-key',
          customHeaders: {
            'User-Agent': 'goff-web/3.0.0',
            Authorization: 'Bearer foo',
          },
        },
        logger,
      );

      const flagKey = 'bool-flag';
      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait('test-provider', apiKeyProvider);
      const client = OpenFeature.getClient('test-provider');
      await websocketMockServer.connected;
      client.getBooleanDetails(flagKey, false);
      const lastCall = fetchMock.lastCall(allFlagsEndpoint);
      expect(lastCall).not.toBeUndefined();
      if (lastCall) {
        const headers = lastCall[1]?.headers as never;
        expect(headers).not.toBeUndefined();
        expect(headers['Authorization']).toBe('Bearer my-api-key');
        expect(headers['User-Agent']).toBe('goff-web/3.0.0');
        return;
      }
      expect(true).toBe(false);
    });
  });

  describe('eventing', () => {
    it('should call client handler with ProviderEvents.Ready when websocket is connected', async () => {
      // await OpenFeature.setContext(defaultContext); // we deactivate this call because the context is already set, and we want to avoid calling contextChanged function
      await OpenFeature.setProviderAndWait('test-provider', defaultProvider);
      const client = OpenFeature.getClient('test-provider');
      client.addHandler(ProviderEvents.Ready, readyHandler);
      client.addHandler(ProviderEvents.Error, errorHandler);
      client.addHandler(ProviderEvents.Stale, staleHandler);
      client.addHandler(ProviderEvents.ConfigurationChanged, configurationChangedHandler);

      // wait for the websocket to be connected to the provider.
      await websocketMockServer.connected;
      await awaitableTimeout(5);

      expect(readyHandler).toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();
      expect(configurationChangedHandler).not.toHaveBeenCalled();
      expect(staleHandler).not.toHaveBeenCalled();
    });

    it('should call client handler with ProviderEvents.ConfigurationChanged when websocket is sending update', async () => {
      // await OpenFeature.setContext(defaultContext); // we deactivate this call because the context is already set, and we want to avoid calling contextChanged function
      await OpenFeature.setProviderAndWait('test-provider', defaultProvider);
      const client = OpenFeature.getClient('test-provider');

      client.addHandler(ProviderEvents.Ready, readyHandler);
      client.addHandler(ProviderEvents.Error, errorHandler);
      client.addHandler(ProviderEvents.Stale, staleHandler);
      client.addHandler(ProviderEvents.ConfigurationChanged, configurationChangedHandler);

      // wait for the websocket to be connected to the provider.
      await websocketMockServer.connected;

      // Need to wait before using the mock
      await awaitableTimeout(5);

      expect(defaultProvider.changeStrategy.status).toBe('connected');

      websocketMockServer.send({
        added: {
          'added-flag-1': {},
          'added-flag-2': {},
        },
        updated: {
          'updated-flag-1': {},
          'updated-flag-2': {},
        },
        deleted: {
          'deleted-flag-1': {},
          'deleted-flag-2': {},
        },
      } as GOFeatureFlagWebsocketResponse);
      // waiting the call to the API to be successful
      await awaitableTimeout(50);

      expect(readyHandler).toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();
      expect(configurationChangedHandler).toHaveBeenCalled();
      expect(staleHandler).not.toHaveBeenCalled();
      expect(configurationChangedHandler.mock.calls[0][0]).toEqual({
        clientName: 'test-provider',
        domain: 'test-provider',
        message: 'flag configuration have changed',
        providerName: 'GoFeatureFlagWebProvider',
        flagsChanged: [
          'deleted-flag-1',
          'deleted-flag-2',
          'updated-flag-1',
          'updated-flag-2',
          'added-flag-1',
          'added-flag-2',
        ],
      });
    });

    it('should call client handler with ProviderEvents.Stale when websocket is unreachable', async () => {
      // await OpenFeature.setContext(defaultContext); // we deactivate this call because the context is already set, and we want to avoid calling contextChanged function
      const provider = new GoFeatureFlagWebProvider(
        {
          endpoint,
          maxRetries: 1,
          retryInitialDelay: 10,
        },
        logger,
      );
      await OpenFeature.setProviderAndWait('test-provider', provider);
      const client = OpenFeature.getClient('test-provider');
      client.addHandler(ProviderEvents.Ready, readyHandler);
      client.addHandler(ProviderEvents.Error, errorHandler);
      client.addHandler(ProviderEvents.Stale, staleHandler);
      client.addHandler(ProviderEvents.ConfigurationChanged, configurationChangedHandler);

      // wait for the websocket to be connected to the provider.
      await websocketMockServer.connected;

      // Need to wait before using the mock
      await awaitableTimeout(50);
      websocketMockServer.close();
      await awaitableTimeout(300);

      expect(readyHandler).toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();
      expect(configurationChangedHandler).not.toHaveBeenCalled();
      expect(staleHandler).toHaveBeenCalled();
    });
  });

  describe('Connection mode WebSocket', () => {
    it('should use WebSocket strategy when mode is unset', async () => {
      const provider = new GoFeatureFlagWebProvider({ endpoint: 'http://localhost:1031', apiTimeout: 1000 });
      await provider.initialize({ targetingKey: 'user-key' });
      expect(provider.changeStrategy).toBeInstanceOf(WebSocketFlagChangeStrategy);
    });

    it('should use WebSocket strategy when mode is "ws"', async () => {
      const provider = new GoFeatureFlagWebProvider({
        endpoint: 'http://localhost:1031',
        apiTimeout: 1000,
        mode: 'ws',
      });
      await provider.initialize({ targetingKey: 'user-key' });
      expect(provider.changeStrategy).toBeInstanceOf(WebSocketFlagChangeStrategy);
    });

    it('should resolve when WebSocket is open', async () => {
      const provider = new GoFeatureFlagWebProvider({ endpoint: 'http://localhost:1031', apiTimeout: 1000 });
      await provider.initialize({ targetingKey: 'user-key' });
      await websocketMockServer.connected;
      expect(provider.changeStrategy.status).toBe('connected');
    });
  });

  describe('Connection mode SSE', () => {
    it('should use SSE EventSource strategy when mode is "sse"', async () => {
      const provider = new GoFeatureFlagWebProvider({ endpoint: 'http://localhost:1031', mode: 'sse' });
      expect(provider.changeStrategy).toBeInstanceOf(ServerSentEventFlagChangeStrategy);
    });

    it('should be in connected state when SSE EventSource is open', async () => {
      const provider = new GoFeatureFlagWebProvider({ endpoint: 'http://localhost:1031', mode: 'sse' });
      const providerInit = provider.initialize({ targetingKey: 'user-key' });
      await providerInit;
      // Let's make the inner EventSource to connect
      EventSourceMock.ready();
      // Let's wait a bit of time to let the provider's change strategy to go in connected state
      await awaitableTimeout(5);
      expect(provider.changeStrategy.status).toBe('connected');
    });

    it('should retry connection if SSE EventSource stay in CONNECTING state', async () => {
      const provider = new GoFeatureFlagWebProvider({
        endpoint: 'http://localhost:1031',
        apiTimeout: 1000,
        mode: 'sse',
      });
      await provider.initialize({ targetingKey: 'user-key' });
      // Let's wait a bit longer before checking
      await awaitableTimeout(2000);
      // Now we can test the behavior when the EventSource is in CONNECTING state
      expect(provider.changeStrategy.status).not.toBe('connected');
      expect(provider.changeStrategy.status).toBe('connecting');
      // let's enable the connection and wait for the EventSource to connect
      EventSourceMock.ready();
      await awaitableTimeout(100);

      expect(provider.changeStrategy.status).not.toBe('connecting');
      expect(provider.changeStrategy.status).toBe('connected');
    });

    // SSE - Eventing

    it('should call client handler with ProviderEvents.Ready when SSE EventSource is connected', async () => {
      // await OpenFeature.setContext(defaultContext); // we deactivate this call because the context is already set, and we want to avoid calling contextChanged function
      await OpenFeature.setProviderAndWait('test-provider', defaultProviderSse);
      const client = OpenFeature.getClient('test-provider');
      client.addHandler(ProviderEvents.Ready, readyHandler);
      client.addHandler(ProviderEvents.Error, errorHandler);
      client.addHandler(ProviderEvents.Stale, staleHandler);
      client.addHandler(ProviderEvents.ConfigurationChanged, configurationChangedHandler);

      // wait for the SSE EventSource to be connected to the provider.
      EventSourceMock.ready();
      await awaitableTimeout(5);

      expect(readyHandler).toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();
      expect(configurationChangedHandler).not.toHaveBeenCalled();
      expect(staleHandler).not.toHaveBeenCalled();
    });

    it('should call client handler with ProviderEvents.ConfigurationChanged when SSE EventSource is sending update', async () => {
      await OpenFeature.setProviderAndWait('test-provider', defaultProviderSse, defaultContext);
      const client = OpenFeature.getClient('test-provider');

      client.addHandler(ProviderEvents.Ready, readyHandler);
      client.addHandler(ProviderEvents.Error, errorHandler);
      client.addHandler(ProviderEvents.Stale, staleHandler);
      client.addHandler(ProviderEvents.ConfigurationChanged, configurationChangedHandler);

      // wait for the SSE EventSource to be connected to the provider.
      EventSourceMock.ready();
      await awaitableTimeout(500);

      expect(defaultProviderSse.changeStrategy.status).toBe('connected');

      EventSourceMock.send({
        added: {
          'added-flag-1': {},
          'added-flag-2': {},
        },
        updated: {
          'updated-flag-1': {},
          'updated-flag-2': {},
        },
        deleted: {
          'deleted-flag-1': {},
          'deleted-flag-2': {},
        },
      } as GOFeatureFlagWebsocketResponse);
      // waiting the call to the API to be successful
      await awaitableTimeout(50);

      expect(readyHandler).toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();
      expect(configurationChangedHandler).toHaveBeenCalled();
      expect(staleHandler).not.toHaveBeenCalled();
      expect(configurationChangedHandler.mock.calls[0][0]).toEqual({
        clientName: 'test-provider',
        domain: 'test-provider',
        message: 'flag configuration have changed',
        providerName: 'GoFeatureFlagWebProvider',
        flagsChanged: [
          'deleted-flag-1',
          'deleted-flag-2',
          'updated-flag-1',
          'updated-flag-2',
          'added-flag-1',
          'added-flag-2',
        ],
      });
    });

    it('should call client handler with ProviderEvents.Stale when SSE EventSource is unreachable', async () => {
      // await OpenFeature.setContext(defaultContext); // we deactivate this call because the context is already set, and we want to avoid calling contextChanged function
      await OpenFeature.setProviderAndWait('test-provider', defaultProviderSse);
      const client = OpenFeature.getClient('test-provider');
      client.addHandler(ProviderEvents.Ready, readyHandler);
      client.addHandler(ProviderEvents.Error, errorHandler);
      client.addHandler(ProviderEvents.Stale, staleHandler);
      client.addHandler(ProviderEvents.ConfigurationChanged, configurationChangedHandler);

      // wait for the SSE EventSource to be connected to the provider.
      EventSourceMock.ready();
      await awaitableTimeout(5);
      expect(defaultProviderSse.changeStrategy.status).toBe('connected');

      // Let's disconnect the SSE EventSource
      EventSourceMock.failAll();
      await awaitableTimeout(5);

      expect(defaultProviderSse.changeStrategy.status).toBe('error');
      expect(readyHandler).toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();
      expect(configurationChangedHandler).not.toHaveBeenCalled();
      expect(staleHandler).toHaveBeenCalled();
    });
  });

  describe('Polling mode', () => {
    it('should be disabled when pollingIntervalMs is not set', async () => {
      const provider = newDefaultProvider({
        apiTimeout: 100,
        maxRetries: 1,
      });
      await provider.initialize({ targetingKey: 'user-key' });
      // we close the websocket connection
      // Need to wait before using the mock
      await awaitableTimeout(5);
      websocketMockServer.close();
      await awaitableTimeout(300);
      expect(logger.inMemoryLogger['debug']).toContain('GoFeatureFlagWebProvider: polling is disabled.');
    });

    it('should be disabled when pollingIntervalMs is set to 0', async () => {
      const provider = newDefaultProvider({
        apiTimeout: 100,
        maxRetries: 1,
        pollingIntervalMs: 0,
      });
      await provider.initialize({ targetingKey: 'user-key' });
      // we close the websocket connection
      // Need to wait before using the mock
      await awaitableTimeout(5);
      websocketMockServer.close();
      await awaitableTimeout(300);
      expect(logger.inMemoryLogger['debug']).toContain('GoFeatureFlagWebProvider: polling is disabled.');
    });

    it('should be disabled when pollingIntervalMs is set to a negative value', async () => {
      const provider = newDefaultProvider({
        apiTimeout: 100,
        maxRetries: 1,
        pollingIntervalMs: -1,
      });
      await provider.initialize({ targetingKey: 'user-key' });
      // we close the websocket connection
      // Need to wait before using the mock
      await awaitableTimeout(5);
      websocketMockServer.close();
      await awaitableTimeout(300);
      expect(logger.inMemoryLogger['debug']).toContain('GoFeatureFlagWebProvider: polling is disabled.');
    });

    it('should be enabled when pollingIntervalMs is set to a positive value', async () => {
      const provider = newDefaultProvider({
        apiTimeout: 100,
        maxRetries: 1,
        pollingIntervalMs: 1000,
      });
      await provider.initialize({ targetingKey: 'user-key' });
      // we close the websocket connection
      // Need to wait before using the mock
      await awaitableTimeout(5);
      websocketMockServer.close();
      await awaitableTimeout(500);
      expect(logger.inMemoryLogger['debug']).toContain('GoFeatureFlagWebProvider: start polling cycle.');
    });

    it('should be disabled when WebSocket is reconnected', async () => {
      const provider = newDefaultProvider({
        apiTimeout: 100,
        maxRetries: 1,
        pollingIntervalMs: 500,
      });
      await provider.initialize({ targetingKey: 'user-key' });
      await awaitableTimeout(500);
      // we reconnect the websocket
      await websocketMockServer.connected;
      await awaitableTimeout(1000);
      expect(provider.changeStrategy.status).toBe('connected');
      expect(logger.inMemoryLogger['debug']).toContain('GoFeatureFlagWebProvider: stop polling cycle.');
    });

    it('should be disabled when SSE is reconnected', async () => {
      const provider = newDefaultProvider({
        apiTimeout: 100,
        maxRetries: 1,
        mode: 'sse',
        pollingIntervalMs: 500,
      });
      await provider.initialize({ targetingKey: 'user-key' });
      await awaitableTimeout(500);
      // we reconnect the websocket
      EventSourceMock.ready();
      await awaitableTimeout(1000);
      expect(provider.changeStrategy.status).toBe('connected');
      expect(logger.inMemoryLogger['debug']).toContain('GoFeatureFlagWebProvider: stop polling cycle.');
    });

    it('should have almost one polling cycle running', async () => {
      const provider = newDefaultProvider({
        apiTimeout: 100,
        maxRetries: 1,
        pollingIntervalMs: 500,
      });
      await provider.initialize({ targetingKey: 'user-key' });
      websocketMockServer.close();
      await awaitableTimeout(5);
      // we try again to connect when already in error state
      provider.changeStrategy.connect();
      await awaitableTimeout(1000);
      expect(logger.inMemoryLogger['debug']).toContain('GoFeatureFlagWebProvider: polling is already running.');
    });
  });

  describe('inline api key update', () => {
    it('should update the Authorization header after calling setApiKey', async () => {
      const p = new GoFeatureFlagWebProvider(
        {
          endpoint: endpoint,
          apiTimeout: 1000,
          maxRetries: 1,
        },
        logger,
      );

      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait('test-provider', p);
      const client = OpenFeature.getClient('test-provider');
      await websocketMockServer.connected;
      await new Promise((resolve) => setTimeout(resolve, 5));

      // Verify no Authorization header before setting the key
      client.getBooleanDetails('bool_flag', false);
      const callBeforeUpdate = fetchMock.lastCall(allFlagsEndpoint);
      expect(callBeforeUpdate).not.toBeUndefined();
      const headersBefore = callBeforeUpdate![1]?.headers as Record<string, string>;
      expect(headersBefore['Authorization']).toBeUndefined();

      // Update the API key at runtime
      await p.setApiKey('my-new-api-key');

      // Trigger a new fetch by changing the context
      fetchMock.post(allFlagsEndpoint, defaultAllFlagResponse, { overwriteRoutes: true });
      await p.onContextChange(defaultContext, { targetingKey: 'another-user' });

      // Verify the new Authorization header is used
      const callAfterUpdate = fetchMock.lastCall(allFlagsEndpoint);
      expect(callAfterUpdate).not.toBeUndefined();
      const headersAfter = callAfterUpdate![1]?.headers as Record<string, string>;
      expect(headersAfter['Authorization']).toBe('Bearer my-new-api-key');
    });

    it('should override an existing API key when setApiKey is called', async () => {
      const p = new GoFeatureFlagWebProvider(
        {
          endpoint: endpoint,
          apiTimeout: 1000,
          maxRetries: 1,
          apiKey: 'original-api-key',
        },
        logger,
      );

      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait('test-provider', p);
      const client = OpenFeature.getClient('test-provider');
      await websocketMockServer.connected;
      await new Promise((resolve) => setTimeout(resolve, 5));

      // Verify the original key is used
      client.getBooleanDetails('bool_flag', false);
      const callBefore = fetchMock.lastCall(allFlagsEndpoint);
      const headersBefore = callBefore![1]?.headers as Record<string, string>;
      expect(headersBefore['Authorization']).toBe('Bearer original-api-key');

      // Override the API key at runtime
      await p.setApiKey('updated-api-key');

      fetchMock.post(allFlagsEndpoint, defaultAllFlagResponse, { overwriteRoutes: true });
      await p.onContextChange(defaultContext, { targetingKey: 'another-user' });

      const callAfter = fetchMock.lastCall(allFlagsEndpoint);
      const headersAfter = callAfter![1]?.headers as Record<string, string>;
      expect(headersAfter['Authorization']).toBe('Bearer updated-api-key');
    });

    it('should not have two websockets open simultaneously during key rotation', async () => {
      const provider = newDefaultProvider({
        apiTimeout: 1000,
        maxRetries: 1,
        apiKey: 'old-key',
      });
      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait('test-provider', provider);
      await websocketMockServer.connected;
      provider.setApiKey('new-key');
      // let's wait a bit before reconnecting
      await awaitableTimeout(10);
      await websocketMockServer.connected;

      // Only one client should be connected at a time
      expect(websocketMockServer.server.clients().length).toBe(1);
    });

    it('should abort in-flight fetchAll when setApiKey is called', async () => {
      const provider = new GoFeatureFlagWebProvider(
        { endpoint, apiTimeout: 1000, maxRetries: 2, apiKey: 'old-key' },
        logger,
      );
      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait('test-provider', provider);
      await websocketMockServer.connected;
      await awaitableTimeout(5);

      // Slow down the next fetch so we can rotate the key mid-flight
      fetchMock.post(allFlagsEndpoint, () => awaitableTimeout(200).then(() => defaultAllFlagResponse), {
        overwriteRoutes: true,
      });

      // Trigger a fetch then immediately rotate the key
      await whenAnySettle([
        provider.onContextChange(defaultContext, { targetingKey: 'another-user' }), // slow fetch (200ms)
        awaitableTimeout(50), // timer wins after 50ms
      ]);

      // Rotate the key
      await provider.setApiKey('new-key');
      await awaitableTimeout(5);

      // Ensure the initial fetch was cancelled.
      expect(logger.inMemoryLogger['error']).toContain('GoFeatureFlagWebProvider: fetchAll operation was aborted');

      // The completed fetch should have used the new key, not the old one
      const headers = fetchMock.lastCall(allFlagsEndpoint)![1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer new-key');
    });
  });

  describe('data collector testing', () => {
    describe('tracking event', () => {
      it('should send tracking event to the data collector', async () => {
        const clientName = expect.getState().currentTestName ?? 'test-provider';
        await OpenFeature.setContext(defaultContext);
        const p = new GoFeatureFlagWebProvider(
          {
            endpoint: endpoint,
            apiTimeout: 1000,
            maxRetries: 1,
            dataFlushInterval: 10000,
          },
          logger,
        );

        await OpenFeature.setProviderAndWait(clientName, p);
        const client = OpenFeature.getClient(clientName);
        await websocketMockServer.connected;
        await new Promise((resolve) => setTimeout(resolve, 5));

        client.getBooleanDetails('bool_flag', false);
        client.getBooleanDetails('bool_flag', false);
        client.track('event-key-123abc', { value: 99.77, currency: 'USD' });

        await OpenFeature.close();

        expect(fetchMock.calls(dataCollectorEndpoint).length).toBe(1);
        const reqBody = fetchMock.lastOptions(dataCollectorEndpoint)?.body;
        const parsedBody = JSON.parse(reqBody as never) as DataCollectorRequest<never>;
        expect(parsedBody.events.length).toBe(3);
        expect(parsedBody.events.filter((event) => event.kind === 'tracking').length).toBe(1);
        expect(parsedBody.events.filter((event) => event.kind === 'feature').length).toBe(2);

        const trackingEvent = parsedBody.events.find((event) => event.kind === 'tracking');
        expect(trackingEvent).not.toBeUndefined();
        const c = trackingEvent as TrackingEvent;
        expect(c.key).toEqual('event-key-123abc');
        expect(c.kind).toEqual('tracking');
        expect(c.contextKind).toEqual('user');
        expect(c.userKey).toEqual(defaultContext.targetingKey);
        expect(c.creationDate).toBeGreaterThan(0);
        expect(c.evaluationContext).toEqual(defaultContext);
        expect(c.trackingEventDetails).toEqual({ value: 99.77, currency: 'USD' });
      });
    });

    describe('feature event', () => {
      it('should call the data collector when closing Open Feature', async () => {
        const clientName = expect.getState().currentTestName ?? 'test-provider';
        await OpenFeature.setContext(defaultContext);
        const p = new GoFeatureFlagWebProvider(
          {
            endpoint: endpoint,
            apiTimeout: 1000,
            maxRetries: 1,
            dataFlushInterval: 10000,
            apiKey: 'toto',
          },
          logger,
        );

        await OpenFeature.setProviderAndWait(clientName, p);
        const client = OpenFeature.getClient(clientName);
        await websocketMockServer.connected;
        await new Promise((resolve) => setTimeout(resolve, 5));

        client.getBooleanDetails('bool_flag', false);
        client.getBooleanDetails('bool_flag', false);

        await OpenFeature.close();

        expect(fetchMock.calls(dataCollectorEndpoint).length).toBe(1);
        expect(fetchMock.lastOptions(dataCollectorEndpoint)?.headers).toEqual({
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Bearer toto',
        });
      });

      it('should call the data collector when waiting more than the dataFlushInterval', async () => {
        const clientName = expect.getState().currentTestName ?? 'test-provider';
        await OpenFeature.setContext(defaultContext);
        const p = new GoFeatureFlagWebProvider(
          {
            endpoint: endpoint,
            apiTimeout: 1000,
            maxRetries: 1,
            dataFlushInterval: 200,
          },
          logger,
        );

        await OpenFeature.setProviderAndWait(clientName, p);
        const client = OpenFeature.getClient(clientName);
        await websocketMockServer.connected;
        await new Promise((resolve) => setTimeout(resolve, 5));

        client.getBooleanDetails('bool_flag', false);
        client.getBooleanDetails('bool_flag', false);

        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(fetchMock.calls(dataCollectorEndpoint).length).toBe(1);
        expect(fetchMock.lastOptions(dataCollectorEndpoint)?.headers).toEqual({
          'Content-Type': 'application/json',
          Accept: 'application/json',
        });
        await OpenFeature.close();
      });
      it('should call the data collector multiple time while waiting dataFlushInterval time', async () => {
        const clientName = expect.getState().currentTestName ?? 'test-provider';
        await OpenFeature.setContext(defaultContext);
        const p = new GoFeatureFlagWebProvider(
          {
            endpoint: endpoint,
            apiTimeout: 1000,
            maxRetries: 1,
            dataFlushInterval: 200,
          },
          logger,
        );

        await OpenFeature.setProviderAndWait(clientName, p);
        const client = OpenFeature.getClient(clientName);
        await websocketMockServer.connected;
        await new Promise((resolve) => setTimeout(resolve, 5));
        client.getBooleanDetails('bool_flag', false);
        client.getBooleanDetails('bool_flag', false);
        await new Promise((resolve) => setTimeout(resolve, 250));
        client.getBooleanDetails('bool_flag', false);
        client.getBooleanDetails('bool_flag', false);
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(fetchMock.calls(dataCollectorEndpoint).length).toBe(2);
        await OpenFeature.close();
      });

      it('should not call the data collector before the dataFlushInterval', async () => {
        const clientName = expect.getState().currentTestName ?? 'test-provider';
        await OpenFeature.setContext(defaultContext);
        const p = new GoFeatureFlagWebProvider(
          {
            endpoint: endpoint,
            apiTimeout: 1000,
            maxRetries: 1,
            dataFlushInterval: 200,
          },
          logger,
        );

        await OpenFeature.setProviderAndWait(clientName, p);
        const client = OpenFeature.getClient(clientName);
        await websocketMockServer.connected;
        await new Promise((resolve) => setTimeout(resolve, 5));
        client.getBooleanDetails('bool_flag', false);
        client.getBooleanDetails('bool_flag', false);
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(fetchMock.calls(dataCollectorEndpoint).length).toBe(0);
        await OpenFeature.close();
      });

      it('should have a log when data collector is not available', async () => {
        const clientName = expect.getState().currentTestName ?? 'test-provider';
        fetchMock.post(dataCollectorEndpoint, 500, { overwriteRoutes: true });
        await OpenFeature.setContext(defaultContext);
        const p = new GoFeatureFlagWebProvider(
          {
            endpoint: endpoint,
            apiTimeout: 1000,
            maxRetries: 1,
            dataFlushInterval: 200,
          },
          logger,
        );

        await OpenFeature.setProviderAndWait(clientName, p);
        const client = OpenFeature.getClient(clientName);
        await websocketMockServer.connected;
        await new Promise((resolve) => setTimeout(resolve, 5));
        client.getBooleanDetails('bool_flag', false);
        client.getBooleanDetails('bool_flag', false);
        await new Promise((resolve) => setTimeout(resolve, 250));

        fetchMock.post(dataCollectorEndpoint, 500, { overwriteRoutes: true });

        client.getBooleanDetails('bool_flag', false);
        client.getBooleanDetails('bool_flag', false);
        fetchMock.post(dataCollectorEndpoint, 200, { overwriteRoutes: true });
        await new Promise((resolve) => setTimeout(resolve, 250));

        const lastBody = fetchMock.lastOptions(dataCollectorEndpoint)?.body;
        const parsedBody = JSON.parse(lastBody as never);
        expect(parsedBody['events'].length).toBe(4);
        await OpenFeature.close();
      });
    });
  });

  it('should call the data collector with exporter metadata', async () => {
    const clientName = expect.getState().currentTestName ?? 'test-provider';
    await OpenFeature.setContext(defaultContext);
    const p = new GoFeatureFlagWebProvider(
      {
        endpoint: endpoint,
        apiTimeout: 1000,
        maxRetries: 1,
        dataFlushInterval: 10000,
        apiKey: 'toto',
        exporterMetadata: {
          browser: 'chrome',
          version: '1.0.0',
          score: 123,
        },
      },
      logger,
    );

    await OpenFeature.setProviderAndWait(clientName, p);
    const client = OpenFeature.getClient(clientName);
    await websocketMockServer.connected;
    await new Promise((resolve) => setTimeout(resolve, 5));

    client.getBooleanDetails('bool_flag', false);
    client.getBooleanDetails('bool_flag', false);

    await OpenFeature.close();

    expect(fetchMock.calls(dataCollectorEndpoint).length).toBe(1);
    const jsonBody = fetchMock.lastOptions(dataCollectorEndpoint)?.body;
    const body = JSON.parse(jsonBody as never) as DataCollectorRequest<never>;
    expect(body.meta).toEqual({
      browser: 'chrome',
      version: '1.0.0',
      score: 123,
      openfeature: true,
      provider: 'web',
    });
  });
});
