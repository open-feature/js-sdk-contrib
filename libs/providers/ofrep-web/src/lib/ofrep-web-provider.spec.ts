import { OfrepWebProvider } from './ofrep-web-provider';
import TestLogger from './test-logger';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { server } from '../../../../shared/ofrep-core/src/test/mock-service-worker';
import { ClientProviderEvents, ClientProviderStatus, OpenFeature } from '@openfeature/web-sdk';

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
    const provider = new OfrepWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
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
    const provider = new OfrepWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
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
    const provider = new OfrepWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
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
    const provider = new OfrepWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
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
    const provider = new OfrepWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
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
    const provider = new OfrepWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
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
    const provider = new OfrepWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
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

  it('should return a FLAG_NOT_FOUND error if the flag does not exist', async () => {
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OfrepWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
    await OpenFeature.setContext(defaultContext);
    await OpenFeature.setProviderAndWait(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const flag = client.getBooleanDetails('non-existent-flag', false);
    expect(flag.errorCode).toBe('FLAG_NOT_FOUND');
    expect(flag.value).toBe(false);
  });

  it('should return EvaluationDetails if the flag exists', async () => {
    const flagKey = 'bool-flag';
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OfrepWebProvider({ baseUrl: endpointBaseURL }, new TestLogger());
    await OpenFeature.setContext(defaultContext);
    await OpenFeature.setProviderAndWait(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    const flag = client.getBooleanDetails(flagKey, false);
    expect(flag).toEqual({
      flagKey,
      value: true,
      variant: 'variantA',
      flagMetadata: { context: defaultContext },
      reason: 'STATIC',
    });
  });
});
