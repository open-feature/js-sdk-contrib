import { GoFeatureFlagWebProvider } from './go-feature-flag-web-provider';
import {
  ErrorCode,
  EvaluationContext,
  EvaluationDetails,
  JsonValue,
  OpenFeature,
  ProviderEvents,
  StandardResolutionReasons,
} from '@openfeature/web-sdk';
import WS from 'jest-websocket-mock';
import TestLogger from './test-logger';
import { GOFeatureFlagWebsocketResponse } from './model';
import fetchMock from 'fetch-mock-jest';

describe('GoFeatureFlagWebProvider', () => {
  let websocketMockServer: WS;
  const endpoint = 'http://localhost:1031/';
  const allFlagsEndpoint = `${endpoint}v1/allflags`;
  const dataCollectorEndpoint = `${endpoint}v1/data/collector`;
  const websocketEndpoint = 'ws://localhost:1031/ws/v1/flag/change';
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
  let defaultContext: EvaluationContext;
  const readyHandler = jest.fn();
  const errorHandler = jest.fn();
  const configurationChangedHandler = jest.fn();
  const staleHandler = jest.fn();
  const logger = new TestLogger();

  beforeEach(async () => {
    await WS.clean();
    await OpenFeature.close();
    fetchMock.mockClear();
    fetchMock.mockReset();
    await jest.resetAllMocks();
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
    defaultContext = { targetingKey: 'user-key' };
  });

  afterEach(async () => {
    await WS.clean();
    websocketMockServer.close();
    await OpenFeature.close();
    await OpenFeature.clearHooks();
    fetchMock.mockClear();
    fetchMock.mockReset();
    await defaultProvider?.onClose();
    await jest.resetAllMocks();
    readyHandler.mockReset();
    errorHandler.mockReset();
    configurationChangedHandler.mockReset();
    staleHandler.mockReset();
    logger.reset();
  });

  function newDefaultProvider(): GoFeatureFlagWebProvider {
    return new GoFeatureFlagWebProvider(
      {
        endpoint: endpoint,
        apiTimeout: 1000,
        maxRetries: 1,
        disableDataCollection: true,
      },
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
      OpenFeature.setProvider('test-provider', defaultProvider);
      const client = await OpenFeature.getClient('test-provider');
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

    it('should return CACHED as a reason is websocket is not connected', async () => {
      await OpenFeature.setContext(defaultContext);
      const providerName = expect.getState().currentTestName || 'test';
      OpenFeature.setProvider(providerName, newDefaultProvider());
      const client = await OpenFeature.getClient(providerName);
      await websocketMockServer.connected;
      // Need to wait before using the mock
      await new Promise((resolve) => setTimeout(resolve, 5));
      await websocketMockServer.close();

      const got = client.getBooleanDetails('bool_flag', false);
      expect(got.reason).toEqual(StandardResolutionReasons.CACHED);
    });

    it('should emit an error if we have the wrong credentials', async () => {
      fetchMock.post(allFlagsEndpoint, 401, { overwriteRoutes: true });
      const providerName = expect.getState().currentTestName || 'test';
      await OpenFeature.setContext(defaultContext);
      OpenFeature.setProvider(providerName, newDefaultProvider());
      const client = await OpenFeature.getClient(providerName);
      client.addHandler(ProviderEvents.Error, errorHandler);
      // wait the event to be triggered
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(errorHandler).toBeCalled();
      expect(logger.inMemoryLogger['error'][0]).toEqual(
        'GoFeatureFlagWebProvider: invalid token used to contact GO Feature Flag instance: Error: Request failed with status code 401',
      );
    });

    it('should emit an error if we receive a 404 from GO Feature Flag', async () => {
      fetchMock.post(allFlagsEndpoint, 404, { overwriteRoutes: true });
      await OpenFeature.setContext(defaultContext);
      OpenFeature.setProvider('test-provider', defaultProvider);
      const client = await OpenFeature.getClient('test-provider');
      client.addHandler(ProviderEvents.Ready, readyHandler);
      client.addHandler(ProviderEvents.Error, errorHandler);
      client.addHandler(ProviderEvents.Stale, staleHandler);
      client.addHandler(ProviderEvents.ConfigurationChanged, configurationChangedHandler);
      // wait the event to be triggered
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(errorHandler).toBeCalled();
      expect(logger.inMemoryLogger['error'][0]).toEqual(
        'GoFeatureFlagWebProvider: impossible to call go-feature-flag relay proxy Error: Request failed with status code 404',
      );
    });

    it('should get a valid boolean flag evaluation', async () => {
      const flagKey = 'bool_flag';
      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait('test-provider', defaultProvider);
      const client = await OpenFeature.getClient('test-provider');
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
      const client = await OpenFeature.getClient('test-provider');
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
      const client = await OpenFeature.getClient('test-provider');
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
      const client = await OpenFeature.getClient('test-provider');
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
      const client = await OpenFeature.getClient('test-provider');
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
      const client = await OpenFeature.getClient('test-provider');
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
        return;
      }
      expect(true).toBe(false);
    });
  });

  describe('eventing', () => {
    it('should call client handler with ProviderEvents.Ready when websocket is connected', async () => {
      // await OpenFeature.setContext(defaultContext); // we deactivate this call because the context is already set, and we want to avoid calling contextChanged function
      OpenFeature.setProvider('test-provider', defaultProvider);
      const client = await OpenFeature.getClient('test-provider');
      client.addHandler(ProviderEvents.Ready, readyHandler);
      client.addHandler(ProviderEvents.Error, errorHandler);
      client.addHandler(ProviderEvents.Stale, staleHandler);
      client.addHandler(ProviderEvents.ConfigurationChanged, configurationChangedHandler);

      // wait for the websocket to be connected to the provider.
      await websocketMockServer.connected;
      await new Promise((resolve) => setTimeout(resolve, 5));

      expect(readyHandler).toBeCalled();
      expect(errorHandler).not.toBeCalled();
      expect(configurationChangedHandler).not.toBeCalled();
      expect(staleHandler).not.toBeCalled();
    });

    it('should call client handler with ProviderEvents.ConfigurationChanged when websocket is sending update', async () => {
      // await OpenFeature.setContext(defaultContext); // we deactivate this call because the context is already set, and we want to avoid calling contextChanged function
      OpenFeature.setProvider('test-provider', defaultProvider);
      const client = await OpenFeature.getClient('test-provider');

      client.addHandler(ProviderEvents.Ready, readyHandler);
      client.addHandler(ProviderEvents.Error, errorHandler);
      client.addHandler(ProviderEvents.Stale, staleHandler);
      client.addHandler(ProviderEvents.ConfigurationChanged, configurationChangedHandler);

      // wait for the websocket to be connected to the provider.
      await websocketMockServer.connected;

      // Need to wait before using the mock
      await new Promise((resolve) => setTimeout(resolve, 5));
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
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(readyHandler).toBeCalled();
      expect(errorHandler).not.toBeCalled();
      expect(configurationChangedHandler).toBeCalled();
      expect(staleHandler).not.toBeCalled();
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
      OpenFeature.setProvider('test-provider', provider);
      const client = await OpenFeature.getClient('test-provider');
      client.addHandler(ProviderEvents.Ready, readyHandler);
      client.addHandler(ProviderEvents.Error, errorHandler);
      client.addHandler(ProviderEvents.Stale, staleHandler);
      client.addHandler(ProviderEvents.ConfigurationChanged, configurationChangedHandler);

      // wait for the websocket to be connected to the provider.
      await websocketMockServer.connected;

      // Need to wait before using the mock
      await new Promise((resolve) => setTimeout(resolve, 5));
      await websocketMockServer.close();
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(readyHandler).toBeCalled();
      expect(errorHandler).not.toBeCalled();
      expect(configurationChangedHandler).not.toBeCalled();
      expect(staleHandler).toBeCalled();
    });
  });

  describe('data collector testing', () => {
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

      OpenFeature.setProvider(clientName, p);
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

      OpenFeature.setProvider(clientName, p);
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

      OpenFeature.setProvider(clientName, p);
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

      OpenFeature.setProvider(clientName, p);
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
      OpenFeature.setContext(defaultContext);
      const p = new GoFeatureFlagWebProvider(
        {
          endpoint: endpoint,
          apiTimeout: 1000,
          maxRetries: 1,
          dataFlushInterval: 200,
        },
        logger,
      );

      OpenFeature.setProvider(clientName, p);
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
  describe('waitWebsocketFinalStatus', () => {
    it('should resolve when WebSocket is open', async () => {
      const provider = new GoFeatureFlagWebProvider({ endpoint: 'http://localhost:1031' });
      const websocket = new WebSocket(websocketEndpoint);

      const promise = provider.waitWebsocketFinalStatus(websocket);
      await websocketMockServer.connected;

      await expect(promise).resolves.toBeUndefined();
    });
  });
});
it('should reject after maximum retries', async () => {
  const provider = new GoFeatureFlagWebProvider({ endpoint: 'http://localhost:1031', maxRetries: 1 });
  const websocket = new WebSocket('ws://localhost:1031/ws/v1/flag/change');
  await expect(provider.waitWebsocketFinalStatus(websocket)).rejects.toThrow(
    'Maximum retries reached while waiting for websocket connection',
  );
});
