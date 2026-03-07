import { OFREPWebProvider } from './ofrep-web-provider';
import TestLogger from '../../test/test-logger';
import { ClientProviderEvents, ClientProviderStatus, OpenFeature } from '@openfeature/web-sdk';
import { OFREPApiFetchError } from '@openfeature/ofrep-core';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { server } from '../../../../shared/ofrep-core/src/test/mock-service-worker';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { TEST_FLAG_METADATA, TEST_FLAG_SET_METADATA } from '../../../../shared/ofrep-core/src/test/test-constants';
import { resolveCacheKeyHash } from './cacheIdentity';
import {
  createPersistedCacheSnapshot,
  deserializePersistedCacheSnapshot,
  serializePersistedCacheSnapshot,
} from './model/persistedCacheSnapshot';

function createStorageAdapter() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
}

describe('OFREPWebProvider', () => {
  const testStorage = createStorageAdapter();

  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: testStorage,
      configurable: true,
    });
    server.listen();
  });
  afterEach(async () => {
    server.resetHandlers();
    await OpenFeature.close();
    testStorage.clear();
  });
  afterAll(() => server.close());

  const endpointBaseURL = 'https://localhost:8080';
  const defaultContext = {
    targetingKey: '21640825-95e7-4335-b149-bd6881cf7875',
    email: 'john.doe@openfeature.dev',
    firstname: 'John',
    lastname: 'Doe',
  };
  const defaultStorageKey = 'ofrepLocalCache';

  async function writeSnapshot(
    providerOptions: ConstructorParameters<typeof OFREPWebProvider>[0],
    context: typeof defaultContext,
    snapshot: Parameters<typeof createPersistedCacheSnapshot>[1],
    storageKey = defaultStorageKey,
    etag = '123',
  ) {
    const cacheKeyHash = await resolveCacheKeyHash(providerOptions, context);
    globalThis.localStorage.setItem(
      storageKey,
      serializePersistedCacheSnapshot(
        createPersistedCacheSnapshot(cacheKeyHash, snapshot, TEST_FLAG_SET_METADATA, etag),
      ),
    );
  }

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

  it('should bootstrap from a matching persisted snapshot on network failure', async () => {
    const snapshot = {
      'cached-flag': {
        key: 'cached-flag',
        value: true,
        variant: 'cached',
        reason: 'STATIC',
        metadata: TEST_FLAG_METADATA,
      },
    };
    const providerOptions = { baseUrl: endpointBaseURL };
    await writeSnapshot(providerOptions, defaultContext, snapshot);

    const provider = new OFREPWebProvider(providerOptions, new TestLogger());
    await provider.initialize({ ...defaultContext, errors: { network: true } });

    expect(provider.flagCache).toEqual(snapshot);
    expect(provider.resolveBooleanEvaluation('cached-flag', false, defaultContext).value).toBe(true);
  });

  it.each([
    ['timeout', { errors: { slowRequest: true } }, { timeoutMs: 50 }],
    ['500 response', { errors: { 500: true } }, {}],
  ])('should use a persisted snapshot on %s during initialize', async (_name, contextOverrides, optionOverrides) => {
    const snapshot = {
      'cached-flag': {
        key: 'cached-flag',
        value: true,
        metadata: TEST_FLAG_METADATA,
      },
    };
    const providerOptions = { baseUrl: endpointBaseURL, ...optionOverrides };
    await writeSnapshot(providerOptions, defaultContext, snapshot);

    const provider = new OFREPWebProvider(providerOptions, new TestLogger());
    await provider.initialize({ ...defaultContext, ...contextOverrides });

    expect(provider.flagCache).toEqual(snapshot);
  });

  it.each([
    ['400 response', { errors: { generic400: true } }],
    ['401 response', { errors: { 401: true } }],
    ['403 response', { errors: { 403: true } }],
  ])('should not use a persisted snapshot on %s during initialize', async (_name, contextOverrides) => {
    const snapshot = {
      'cached-flag': {
        key: 'cached-flag',
        value: true,
        metadata: TEST_FLAG_METADATA,
      },
    };
    const providerOptions = { baseUrl: endpointBaseURL };
    await writeSnapshot(providerOptions, defaultContext, snapshot);

    const provider = new OFREPWebProvider(providerOptions, new TestLogger());
    await expect(provider.initialize({ ...defaultContext, ...contextOverrides })).rejects.toThrow();
    expect(provider.flagCache).toEqual({});
  });

  it('should ignore a persisted snapshot when the cache key hash does not match', async () => {
    const snapshot = {
      'cached-flag': {
        key: 'cached-flag',
        value: true,
        metadata: TEST_FLAG_METADATA,
      },
    };
    await writeSnapshot(
      { baseUrl: endpointBaseURL, headers: [['Authorization', 'Bearer other-user']] },
      defaultContext,
      snapshot,
    );

    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
    await expect(provider.initialize({ ...defaultContext, errors: { network: true } })).rejects.toThrow(
      OFREPApiFetchError,
    );
    expect(provider.flagCache).toEqual({});
  });

  it('should reuse the persisted etag for if-none-match requests', async () => {
    const snapshot = {
      'cached-flag': {
        key: 'cached-flag',
        value: true,
        metadata: TEST_FLAG_METADATA,
      },
    };
    await writeSnapshot({ baseUrl: endpointBaseURL }, defaultContext, snapshot, defaultStorageKey, '123');

    const requestHeaders: string[] = [];
    const provider = new OFREPWebProvider(
      {
        baseUrl: endpointBaseURL,
        fetchImplementation: async (input, init) => {
          const request = input as Request;
          requestHeaders.push(request.headers.get('If-None-Match') ?? '');
          return globalThis.fetch(input, init);
        },
      },
      new TestLogger(),
    );

    await provider.initialize(defaultContext);

    expect(requestHeaders).toContain('123');
    expect(provider.flagCache).toEqual(snapshot);
  });

  it('should replace a persisted snapshot after a later successful 200 response', async () => {
    const snapshot = {
      'cached-flag': {
        key: 'cached-flag',
        value: true,
        metadata: TEST_FLAG_METADATA,
      },
    };
    const providerOptions = { baseUrl: endpointBaseURL };
    await writeSnapshot(providerOptions, defaultContext, snapshot, defaultStorageKey, '123');

    const provider = new OFREPWebProvider(providerOptions, new TestLogger());
    await provider.initialize({ ...defaultContext, changeConfig: true });

    const persistedSnapshot = deserializePersistedCacheSnapshot(
      globalThis.localStorage.getItem(defaultStorageKey) ?? '',
    );
    expect(persistedSnapshot).toBeDefined();
    expect(persistedSnapshot?.etag).toBe('1234');
    expect(persistedSnapshot?.data['object-flag-2']).toEqual({
      key: 'object-flag-2',
      value: { complex: true, nested: { also: true } },
      metadata: TEST_FLAG_METADATA,
    });
  });

  it('should ignore and not write local cache when disableLocalCache is set', async () => {
    const snapshot = {
      'cached-flag': {
        key: 'cached-flag',
        value: true,
        metadata: TEST_FLAG_METADATA,
      },
    };
    const providerOptions = { baseUrl: endpointBaseURL };
    await writeSnapshot(providerOptions, defaultContext, snapshot);

    const offlineProvider = new OFREPWebProvider(
      { baseUrl: endpointBaseURL, disableLocalCache: true },
      new TestLogger(),
    );
    await expect(offlineProvider.initialize({ ...defaultContext, errors: { network: true } })).rejects.toThrow(
      OFREPApiFetchError,
    );

    testStorage.clear();

    const liveProvider = new OFREPWebProvider({ baseUrl: endpointBaseURL, disableLocalCache: true }, new TestLogger());
    await liveProvider.initialize(defaultContext);

    expect(globalThis.localStorage.getItem(defaultStorageKey)).toBeNull();
  });

  it('should send a configuration changed event, when new flag is send', async () => {
    const flagKey = 'object-flag';
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL, pollInterval: 100 }, new TestLogger());
    await OpenFeature.setContext({ ...defaultContext, changeConfig: true });
    await OpenFeature.setProviderAndWait(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const configChangedHandler = jest.fn();
    const readyHandler = jest.fn();
    const reconcilingHandler = jest.fn();
    client.addHandler(ClientProviderEvents.Ready, readyHandler);
    client.addHandler(ClientProviderEvents.ConfigurationChanged, configChangedHandler);
    client.addHandler(ClientProviderEvents.Reconciling, reconcilingHandler);

    client.getObjectDetails(flagKey, {});

    await new Promise((resolve) => setTimeout(resolve, 130));
    expect(readyHandler).toHaveBeenCalledTimes(1);
    expect(configChangedHandler).toHaveBeenCalledTimes(1);
    expect(reconcilingHandler).not.toHaveBeenCalled();

    const got2 = client.getObjectDetails(flagKey, {});
    expect(got2.value).toEqual({ complex: true, nested: { also: true }, refreshed: true });
  });

  it('should call reconciling handler, when context changed', async () => {
    const flagKey = 'object-flag';
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
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
    const provider = new OFREPWebProvider({ baseUrl: endpointBaseURL, pollInterval: 50 }, new TestLogger());
    await OpenFeature.setContext(defaultContext);
    await OpenFeature.setProviderAndWait(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const readyHandler = jest.fn();
    const reconcilingHandler = jest.fn();
    client.addHandler(ClientProviderEvents.Ready, readyHandler);
    client.addHandler(ClientProviderEvents.Reconciling, reconcilingHandler);

    client.getObjectDetails(flagKey, {});
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

    client.getObjectDetails(flagKey, {});
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
});
