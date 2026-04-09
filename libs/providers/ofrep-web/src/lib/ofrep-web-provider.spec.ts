import { ErrorCode } from '@openfeature/core';
import { OFREPWebProvider } from './ofrep-web-provider';
import TestLogger from '../../test/test-logger';
import type { FlagCache } from './model/in-memory-cache';
import { Storage } from './store/storage';
import { ClientProviderEvents, ClientProviderStatus, OpenFeature, StandardResolutionReasons } from '@openfeature/web-sdk';
import { http, HttpResponse } from 'msw';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { server } from '../../../../shared/ofrep-core/src/test/mock-service-worker';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { TEST_FLAG_METADATA, TEST_FLAG_SET_METADATA } from '../../../../shared/ofrep-core/src/test/test-constants';

describe('OFREPWebProvider', () => {
  beforeAll(() => server.listen());
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(async () => {
    server.resetHandlers();
    await OpenFeature.close();
  });
  afterAll(() => server.close());

  const endpointBaseURL = 'https://localhost:8080';
  const defaultContext = {
    targetingKey: '21640825-95e7-4335-b149-bd6881cf7875',
    email: 'john.doe@openfeature.dev',
    firstname: 'John',
    lastname: 'Doe',
  };

  it('should call the READY handler, when the provider is ready', async () => {
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
    await OpenFeature.setContext(defaultContext);
    OpenFeature.setProvider(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const readyHandler = jest.fn();
    client.addHandler(ClientProviderEvents.Ready, readyHandler);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(readyHandler).toHaveBeenCalled();
    expect(client.providerStatus).toBe(ClientProviderStatus.READY);
  });

  it('should be in FATAL status if 401 error during initialise', async () => {
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
    await OpenFeature.setContext({ ...defaultContext, errors: { 401: true } });
    OpenFeature.setProvider(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const errorHandler = jest.fn();
    client.addHandler(ClientProviderEvents.Error, errorHandler);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(errorHandler).toHaveBeenCalled();
    expect(client.providerStatus).toBe(ClientProviderStatus.FATAL);
  });

  it('should be in FATAL status if 403 error during initialise', async () => {
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
    await OpenFeature.setContext({ ...defaultContext, errors: { 403: true } });
    OpenFeature.setProvider(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const errorHandler = jest.fn();
    const readyHandler = jest.fn();
    client.addHandler(ClientProviderEvents.Error, errorHandler);
    client.addHandler(ClientProviderEvents.Ready, readyHandler);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(errorHandler).toHaveBeenCalled();
    expect(readyHandler).not.toHaveBeenCalled();

    expect(client.providerStatus).toBe(ClientProviderStatus.FATAL);
  });

  it('should be in ERROR status if 429 error during initialise', async () => {
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
    await OpenFeature.setContext({ ...defaultContext, errors: { 429: true } });
    OpenFeature.setProvider(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const errorHandler = jest.fn();
    const readyHandler = jest.fn();
    client.addHandler(ClientProviderEvents.Error, errorHandler);
    client.addHandler(ClientProviderEvents.Ready, readyHandler);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(errorHandler).toHaveBeenCalled();
    expect(readyHandler).not.toHaveBeenCalled();

    expect(client.providerStatus).toBe(ClientProviderStatus.ERROR);
  });

  it('should be in ERROR status if targetingKey is missing', async () => {
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
    await OpenFeature.setContext({ ...defaultContext, errors: { targetingMissing: true } });
    OpenFeature.setProvider(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const errorHandler = jest.fn();
    const readyHandler = jest.fn();
    client.addHandler(ClientProviderEvents.Error, errorHandler);
    client.addHandler(ClientProviderEvents.Ready, readyHandler);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(errorHandler).toHaveBeenCalled();
    expect(readyHandler).not.toHaveBeenCalled();

    expect(client.providerStatus).toBe(ClientProviderStatus.ERROR);
  });

  it('should be in ERROR status if invalid context', async () => {
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
    await OpenFeature.setContext({ ...defaultContext, errors: { invalidContext: true } });
    OpenFeature.setProvider(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const errorHandler = jest.fn();
    const readyHandler = jest.fn();
    client.addHandler(ClientProviderEvents.Error, errorHandler);
    client.addHandler(ClientProviderEvents.Ready, readyHandler);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(errorHandler).toHaveBeenCalled();
    expect(readyHandler).not.toHaveBeenCalled();

    expect(client.providerStatus).toBe(ClientProviderStatus.ERROR);
  });

  it('should be in ERROR status if parse error', async () => {
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
    await OpenFeature.setContext({ ...defaultContext, errors: { parseError: true } });
    OpenFeature.setProvider(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const errorHandler = jest.fn();
    const readyHandler = jest.fn();
    client.addHandler(ClientProviderEvents.Error, errorHandler);
    client.addHandler(ClientProviderEvents.Ready, readyHandler);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(errorHandler).toHaveBeenCalled();
    expect(readyHandler).not.toHaveBeenCalled();

    expect(client.providerStatus).toBe(ClientProviderStatus.ERROR);
  });

  it('should return a FLAG_NOT_FOUND error and flag set metadata if the flag does not exist', async () => {
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
    await OpenFeature.setContext(defaultContext);
    await OpenFeature.setProviderAndWait(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const flag = client.getBooleanDetails('non-existent-flag', false);
    expect(flag.errorCode).toBe('FLAG_NOT_FOUND');
    expect(flag.value).toBe(false);
    expect(flag.flagMetadata).toEqual(TEST_FLAG_SET_METADATA);
  });

  it('should return default value if API does not return a value', async () => {
    const flagKey = 'flag-without-value';
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
    await OpenFeature.setContext(defaultContext);
    await OpenFeature.setProviderAndWait(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const flag = client.getNumberDetails(flagKey, 42);
    expect(flag).toEqual({
      flagKey,
      value: 42,
      variant: 'emptyVariant',
      flagMetadata: TEST_FLAG_METADATA,
      reason: 'DISABLED',
    });
  });

  it('should return EvaluationDetails if the flag exists', async () => {
    const flagKey = 'bool-flag';
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
    await OpenFeature.setContext(defaultContext);
    await OpenFeature.setProviderAndWait(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const flag = client.getBooleanDetails(flagKey, false);
    expect(flag).toEqual({
      flagKey,
      value: true,
      variant: 'variantA',
      flagMetadata: TEST_FLAG_METADATA,
      reason: 'STATIC',
    });
  });

  it('should return ParseError if the API return the error', async () => {
    const flagKey = 'parse-error';
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
    await OpenFeature.setContext({ ...defaultContext, errors: { flagInError: true } });
    await OpenFeature.setProviderAndWait(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const flag = client.getBooleanDetails(flagKey, false);
    expect(flag).toEqual({
      flagKey,
      value: false,
      errorCode: 'PARSE_ERROR',
      errorMessage: 'custom error details',
      reason: 'ERROR',
      flagMetadata: {},
    });
  });

  it('should send a configuration changed event, when new flag is send', async () => {
    const flagKey = 'object-flag';
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL, pollInterval: 50 }, new TestLogger());
    await OpenFeature.setContext({ ...defaultContext, changeConfig: true });
    await OpenFeature.setProviderAndWait(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const configChangedHandler = jest.fn();
    const readyHandler = jest.fn();
    const reconcilingHandler = jest.fn();
    client.addHandler(ClientProviderEvents.Ready, readyHandler);
    client.addHandler(ClientProviderEvents.ConfigurationChanged, configChangedHandler);
    client.addHandler(ClientProviderEvents.Reconciling, reconcilingHandler);

    const got1 = client.getObjectDetails(flagKey, {});

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(readyHandler).toHaveBeenCalledTimes(1);
    expect(configChangedHandler).toHaveBeenCalledTimes(1);
    expect(reconcilingHandler).not.toHaveBeenCalled();

    const got2 = client.getObjectDetails(flagKey, {});
    expect(got1).not.toEqual(got2);
  });

  it('should call reconciling handler, when context changed', async () => {
    const flagKey = 'object-flag';
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider(
      { baseUrl: endpointBaseURL, disableLocalCache: true },
      new TestLogger(),
    );
    await OpenFeature.setContext(defaultContext);
    await OpenFeature.setProviderAndWait(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const configChangedHandler = jest.fn();
    const readyHandler = jest.fn();
    const reconcilingHandler = jest.fn();
    client.addHandler(ClientProviderEvents.Ready, readyHandler);
    client.addHandler(ClientProviderEvents.ConfigurationChanged, configChangedHandler);
    client.addHandler(ClientProviderEvents.Reconciling, reconcilingHandler);

    const got1 = client.getObjectDetails(flagKey, {});
    await OpenFeature.setContext({ ...defaultContext, contextChanged: true });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(readyHandler).toHaveBeenCalledTimes(1);
    expect(reconcilingHandler).toHaveBeenCalledTimes(1);
    expect(configChangedHandler).not.toHaveBeenCalled();

    const got2 = client.getObjectDetails(flagKey, {});
    expect(got1).not.toEqual(got2);
  });

  it('should call stale handler, when api is not responding', async () => {
    const flagKey = 'object-flag';
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider(
      { baseUrl: endpointBaseURL, pollInterval: 50, disableLocalCache: true },
      new TestLogger(),
    );
    await OpenFeature.setContext(defaultContext);
    await OpenFeature.setProviderAndWait(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const readyHandler = jest.fn();
    const reconcilingHandler = jest.fn();
    client.addHandler(ClientProviderEvents.Ready, readyHandler);
    client.addHandler(ClientProviderEvents.Reconciling, reconcilingHandler);

    const got1 = client.getObjectDetails(flagKey, {});
    await OpenFeature.setContext({ ...defaultContext, errors: { 401: true } });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(readyHandler).toHaveBeenCalledTimes(1);
    expect(reconcilingHandler).toHaveBeenCalledTimes(1);

    // Commenting those checks, because we are not able to retrieve the information
    // of the provider being stale inside the provider itself.
    // Because of that, we cannot manage the CACHED reason properly.
    //
    // const got2 = client.getObjectDetails(flagKey, {});
    // expect(got1).not.toEqual(got2);
    // expect(got2.reason).toBe('CACHED');
  });

  it('should not try to call the API before retry-after header', async () => {
    const flagKey = 'object-flag';
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL, pollInterval: 100 }, new TestLogger());
    await OpenFeature.setContext(defaultContext);
    await OpenFeature.setProviderAndWait(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const reconcilingHandler = jest.fn();
    const staleHandler = jest.fn();
    client.addHandler(ClientProviderEvents.Reconciling, reconcilingHandler);
    client.addHandler(ClientProviderEvents.Stale, staleHandler);

    const got1 = client.getObjectDetails(flagKey, {});
    await OpenFeature.setContext({ ...defaultContext, errors: { 429: true } });
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(reconcilingHandler).toHaveBeenCalledTimes(1);
    expect(staleHandler).toHaveBeenCalledTimes(1);
    await OpenFeature.setContext({ ...defaultContext });
    expect(staleHandler).toHaveBeenCalledTimes(1);
    expect(staleHandler).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(reconcilingHandler).toHaveBeenCalledTimes(2);
  });

  describe('persistent local cache', () => {
    const LOCAL_STORAGE_KEY_PREFIX = 'ofrep-web-provider';

    function seedPersistentCache(targetingKey: string, cache: FlagCache): void {
      const storage = new Storage(false);
      localStorage.setItem(
        `${LOCAL_STORAGE_KEY_PREFIX}:${storage.getStorageKey(targetingKey)}`,
        JSON.stringify(cache),
      );
    }

    const boolFlagCache: FlagCache = {
      'bool-flag': {
        key: 'bool-flag',
        value: true,
        metadata: TEST_FLAG_METADATA,
        variant: 'variantA',
        reason: StandardResolutionReasons.STATIC,
      },
    };

    it('emits READY from persisted cache on init (cache-first), then refreshes from the network in the background', async () => {
      const providerName = expect.getState().currentTestName || 'test-provider';
      seedPersistentCache(defaultContext.targetingKey, boolFlagCache);
      const provider = new OFREPWebProvider(
        { baseUrl: endpointBaseURL, pollInterval: -1 },
        new TestLogger(),
      );
      await OpenFeature.setContext(defaultContext);
      OpenFeature.setProvider(providerName, provider);
      const client = OpenFeature.getClient(providerName);
      const readyHandler = jest.fn(() => {
        const atReady = client.getBooleanDetails('bool-flag', false);
        expect(atReady.reason).toBe(StandardResolutionReasons.CACHED);
        expect(atReady.value).toBe(true);
      });
      client.addHandler(ClientProviderEvents.Ready, readyHandler);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(readyHandler).toHaveBeenCalled();
      const details = client.getBooleanDetails('bool-flag', false);
      expect(details.reason).toBe(StandardResolutionReasons.STATIC);
      expect(details.value).toBe(true);
    });

    it('refreshes from the network in the background after a cache hit when polling is enabled', async () => {
      const providerName = expect.getState().currentTestName || 'test-provider';
      seedPersistentCache(defaultContext.targetingKey, boolFlagCache);
      const provider = new OFREPWebProvider(
        { baseUrl: endpointBaseURL, pollInterval: 50 },
        new TestLogger(),
      );
      await OpenFeature.setContext(defaultContext);
      OpenFeature.setProvider(providerName, provider);
      const client = OpenFeature.getClient(providerName);
      const configChangedHandler = jest.fn();
      client.addHandler(ClientProviderEvents.ConfigurationChanged, configChangedHandler);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(configChangedHandler).toHaveBeenCalled();
      const details = client.getBooleanDetails('bool-flag', false);
      expect(details.reason).toBe(StandardResolutionReasons.STATIC);
      expect(details.value).toBe(true);
    });

    it('does not read or write localStorage when disableLocalCache is true', async () => {
      const providerName = expect.getState().currentTestName || 'test-provider';
      const storage = new Storage(false);
      const seededKey = `${LOCAL_STORAGE_KEY_PREFIX}:${storage.getStorageKey(defaultContext.targetingKey)}`;
      seedPersistentCache(defaultContext.targetingKey, boolFlagCache);
      expect(localStorage.getItem(seededKey)).not.toBeNull();
      const provider = new OFREPWebProvider(
        { baseUrl: endpointBaseURL, disableLocalCache: true, pollInterval: -1 },
        new TestLogger(),
      );
      await OpenFeature.setContext(defaultContext);
      await OpenFeature.setProviderAndWait(providerName, provider);
      const client = OpenFeature.getClient(providerName);
      const details = client.getBooleanDetails('bool-flag', false);
      expect(details.reason).toBe(StandardResolutionReasons.STATIC);
      expect(localStorage.getItem(seededKey)).toEqual(JSON.stringify(boolFlagCache));
    });

    it('loads persisted cache for the new targeting key on context change, then aligns with the network', async () => {
      const providerName = expect.getState().currentTestName || 'test-provider';
      const user1 = defaultContext.targetingKey;
      const user2 = '22222222-2222-4222-8222-222222222222';
      const flagKey = 'per-user-cache-flag';
      const ctx = (targetingKey: string) => ({ ...defaultContext, targetingKey, perUserCacheTest: true });
      seedPersistentCache(user1, {
        [flagKey]: {
          key: flagKey,
          value: { user: 1 },
          metadata: TEST_FLAG_METADATA,
          reason: StandardResolutionReasons.STATIC,
        },
      });
      seedPersistentCache(user2, {
        [flagKey]: {
          key: flagKey,
          value: { user: 2 },
          metadata: TEST_FLAG_METADATA,
          reason: StandardResolutionReasons.STATIC,
        },
      });
      const provider = new OFREPWebProvider(
        { baseUrl: endpointBaseURL, pollInterval: -1 },
        new TestLogger(),
      );
      await OpenFeature.setContext(ctx(user1));
      await OpenFeature.setProviderAndWait(providerName, provider);
      const client = OpenFeature.getClient(providerName);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(client.getObjectDetails(flagKey, {}).value).toEqual({ user: 1 });
      expect(client.getObjectDetails(flagKey, {}).reason).toBe(StandardResolutionReasons.STATIC);

      await OpenFeature.setContext(ctx(user2));
      expect(client.getObjectDetails(flagKey, {}).value).toEqual({ user: 2 });
      expect(client.getObjectDetails(flagKey, {}).reason).toBe(StandardResolutionReasons.CACHED);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(client.getObjectDetails(flagKey, {}).value).toEqual({ user: 2 });
      expect(client.getObjectDetails(flagKey, {}).reason).toBe(StandardResolutionReasons.STATIC);
    });

    it('removes persisted cache when a background fetch returns 401', async () => {
      const providerName = expect.getState().currentTestName || 'test-provider';
      seedPersistentCache(defaultContext.targetingKey, boolFlagCache);
      const storage = new Storage(false);
      const lsKey = `${LOCAL_STORAGE_KEY_PREFIX}:${storage.getStorageKey(defaultContext.targetingKey)}`;
      expect(localStorage.getItem(lsKey)).not.toBeNull();

      server.use(
        http.post('https://localhost:8080/ofrep/v1/evaluate/flags', () => HttpResponse.text(undefined, { status: 401 })),
      );

      const provider = new OFREPWebProvider(
        { baseUrl: endpointBaseURL, pollInterval: 50 },
        new TestLogger(),
      );
      await OpenFeature.setContext(defaultContext);
      OpenFeature.setProvider(providerName, provider);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(localStorage.getItem(lsKey)).toBeNull();
    });

    it('removes persisted cache when a background fetch returns 400 (config error)', async () => {
      const providerName = expect.getState().currentTestName || 'test-provider';
      seedPersistentCache(defaultContext.targetingKey, boolFlagCache);
      const storage = new Storage(false);
      const lsKey = `${LOCAL_STORAGE_KEY_PREFIX}:${storage.getStorageKey(defaultContext.targetingKey)}`;

      server.use(
        http.post('https://localhost:8080/ofrep/v1/evaluate/flags', () =>
          HttpResponse.json({ errorCode: ErrorCode.TARGETING_KEY_MISSING }, { status: 400 }),
        ),
      );

      const provider = new OFREPWebProvider(
        { baseUrl: endpointBaseURL, pollInterval: 50 },
        new TestLogger(),
      );
      await OpenFeature.setContext(defaultContext);
      OpenFeature.setProvider(providerName, provider);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(localStorage.getItem(lsKey)).toBeNull();
    });
  });
});
