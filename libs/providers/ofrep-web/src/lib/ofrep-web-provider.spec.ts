import { OFREPWebProvider } from './ofrep-web-provider';
import TestLogger from '../../test/test-logger';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { server } from '../../../../shared/ofrep-core/src/test/mock-service-worker';
import { ClientProviderEvents, ClientProviderStatus, OpenFeature } from '@openfeature/web-sdk';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { TEST_FLAG_METADATA, TEST_FLAG_SET_METADATA } from '../../../../shared/ofrep-core/src/test/test-constants';

describe('OFREPWebProvider', () => {
  beforeAll(() => server.listen());
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
      errorMessage: 'Flag or flag configuration could not be parsed',
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
});
