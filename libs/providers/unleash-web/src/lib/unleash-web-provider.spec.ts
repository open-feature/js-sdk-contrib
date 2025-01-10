import { UnleashWebProvider } from './unleash-web-provider';
import fetchMock, { enableFetchMocks } from 'jest-fetch-mock';
import { OpenFeature, ProviderEvents, TypeMismatchError } from '@openfeature/web-sdk';
import testdata from './testdata.json';
import TestLogger from './test-logger';

const endpoint = 'http://localhost:4242';
const logger = new TestLogger();
const valueProperty = 'value';

describe('UnleashWebProvider', () => {
  let provider: UnleashWebProvider;

  beforeAll(async () => {
    enableFetchMocks();
  });

  it('should be an instance of UnleashWebProvider', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ toggles: [] }));
    const context = {
      userId: '123',
      sessionId: '456',
      remoteAddress: 'address',
      properties: {
        property1: 'property1',
        property2: 'property2',
      },
    };
    provider = new UnleashWebProvider(
      { url: endpoint, clientKey: 'clientsecret', appName: 'test', context: context },
      logger,
    );
    await provider.initialize();
    expect(provider).toBeInstanceOf(UnleashWebProvider);
  });
});

describe('events', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  beforeAll(async () => {
    enableFetchMocks();
  });

  it('should emit ProviderEvents.ConfigurationChanged and ProviderEvents.Ready events when provider is initialized', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ toggles: [] }));
    const provider = new UnleashWebProvider({ url: endpoint, clientKey: 'clientsecret', appName: 'test' }, logger);

    const configChangeHandler = jest.fn();
    const readyHandler = jest.fn();
    provider.events.addHandler(ProviderEvents.ConfigurationChanged, configChangeHandler);
    provider.events.addHandler(ProviderEvents.Ready, readyHandler);
    await provider.initialize();
    expect(configChangeHandler).toHaveBeenCalledWith({
      message: 'Flags changed',
    });
    expect(readyHandler).toHaveBeenCalledWith({
      message: 'Ready',
    });
  });

  it('should emit ProviderEvents.Error event when provider errors on initialization', async () => {
    fetchMock.mockResponseOnce('{}', { status: 401 });
    const provider = new UnleashWebProvider({ url: endpoint, clientKey: 'clientsecret', appName: 'test' }, logger);
    const handler = jest.fn();
    provider.events.addHandler(ProviderEvents.Error, handler);
    await provider.initialize();
    expect(handler).toHaveBeenCalledWith({
      message: 'Error',
    });
  });

  it('should emit ProviderEvents.ConfigurationChanged when the flags change', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ toggles: [] }));
    const provider = new UnleashWebProvider(
      { url: endpoint, clientKey: 'clientsecret', appName: 'test', refreshInterval: 2 },
      logger,
    );
    await provider.initialize();
    await new Promise<void>((resolve) => {
      const configChangeHandler = function () {
        resolve();
      };
      provider.events.addHandler(ProviderEvents.ConfigurationChanged, configChangeHandler);
      fetchMock.mockResponseOnce(JSON.stringify(testdata));
    });
  });

  it('should emit ProviderEvents.Ready when provider recovers from an error', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ toggles: [] }));
    const provider = new UnleashWebProvider(
      { url: endpoint, clientKey: 'clientsecret', appName: 'test', refreshInterval: 2 },
      logger,
    );
    await provider.initialize();
    await new Promise<void>((resolve) => {
      const errorHandler = function () {
        resolve();
      };
      provider.events.addHandler(ProviderEvents.Error, errorHandler);
      fetchMock.mockResponseOnce('{}', { status: 401 });
    });

    await new Promise<void>((resolve) => {
      const readyHandler = function () {
        resolve();
      };
      provider.events.addHandler(ProviderEvents.Ready, readyHandler);
      fetchMock.mockResponseOnce(JSON.stringify(testdata));
    });
  }, 10000);
});

describe('onContextChange', () => {
  let provider: UnleashWebProvider;

  beforeEach(async () => {
    await jest.resetAllMocks();
    provider = new UnleashWebProvider({ url: endpoint, clientKey: 'clientsecret', appName: 'test' }, logger);
    jest.spyOn(provider.unleashClient as any, 'fetchToggles').mockImplementation();
  });

  afterEach(async () => {
    await OpenFeature.close();
  });

  it('sets all unleash context options with no custom properties', async () => {
    const unleashClientMock = jest.spyOn(provider.unleashClient as any, 'updateContext');
    await OpenFeature.setProviderAndWait(provider);
    await OpenFeature.setContext({
      userId: 'theUserId',
      appName: 'anAppName',
      remoteAddress: 'the.remoteAddress',
      currentTime: '8/12/24 10:10:23',
      sessionId: '1234-3245-56567',
      environment: 'dev',
    });
    expect(unleashClientMock).toHaveBeenCalledWith({
      userId: 'theUserId',
      appName: 'anAppName',
      remoteAddress: 'the.remoteAddress',
      currentTime: '8/12/24 10:10:23',
      sessionId: '1234-3245-56567',
      environment: 'dev',
    });
  });

  it('sets all unleash context options with some custom properties', async () => {
    const unleashClientMock = jest.spyOn(provider.unleashClient as any, 'updateContext');
    await OpenFeature.setProviderAndWait(provider);
    await OpenFeature.setContext({
      userId: 'theUserId',
      appName: 'anAppName',
      remoteAddress: 'the.remoteAddress',
      currentTime: '8/12/24 10:10:23',
      sessionId: '1234-3245-56567',
      environment: 'dev',
      foo: 'bar',
      hello: 'world',
    });
    expect(unleashClientMock).toHaveBeenCalledWith({
      userId: 'theUserId',
      appName: 'anAppName',
      remoteAddress: 'the.remoteAddress',
      currentTime: '8/12/24 10:10:23',
      sessionId: '1234-3245-56567',
      environment: 'dev',
      properties: {
        foo: 'bar',
        hello: 'world',
      },
    });
  });
});

describe('UnleashWebProvider evaluations', () => {
  let provider: UnleashWebProvider;

  beforeEach(() => {
    fetchMock.resetMocks();
  });

  beforeAll(async () => {
    enableFetchMocks();
    fetchMock.mockResponseOnce(JSON.stringify(testdata));
    provider = new UnleashWebProvider({ url: endpoint, clientKey: 'clientsecret', appName: 'test' }, logger);
    await provider.initialize();
  });

  describe('method resolveBooleanEvaluation', () => {
    it('should return false for missing toggle', () => {
      const evaluation = provider.resolveBooleanEvaluation('nonExistent');
      expect(evaluation).toHaveProperty(valueProperty, false);
    });

    it('should return true if enabled toggle exists', () => {
      const evaluation = provider.resolveBooleanEvaluation('simpleToggle');
      expect(evaluation).toHaveProperty(valueProperty, true);
    });

    it('should return false if a disabled toggle exists', () => {
      const evaluation = provider.resolveBooleanEvaluation('disabledToggle');
      expect(evaluation).toHaveProperty(valueProperty, false);
    });
  });

  describe('method resolveStringEvaluation', () => {
    it('should return default value for missing value', () => {
      const evaluation = provider.resolveStringEvaluation('nonExistent', 'defaultValue');
      expect(evaluation).toHaveProperty(valueProperty, 'defaultValue');
    });

    it('should return right value if variant toggle exists and is enabled', () => {
      const evaluation = provider.resolveStringEvaluation('variantToggleString', 'variant1');
      expect(evaluation).toHaveProperty(valueProperty, 'some-text');
    });

    it('should return default value if a toggle is disabled', () => {
      const evaluation = provider.resolveStringEvaluation('disabledVariant', 'defaultValue');
      expect(evaluation).toHaveProperty(valueProperty, 'defaultValue');
    });

    it('should throw TypeMismatchError if requested variant type is not a string', () => {
      expect(() => provider.resolveStringEvaluation('variantToggleJson', 'default string')).toThrow(TypeMismatchError);
    });
  });

  describe('method resolveNumberEvaluation', () => {
    it('should return default value for missing value', () => {
      const evaluation = provider.resolveNumberEvaluation('nonExistent', 5);
      expect(evaluation).toHaveProperty(valueProperty, 5);
    });

    it('should return integer value if variant toggle exists and is enabled', () => {
      const evaluation = provider.resolveNumberEvaluation('variantToggleInteger', 0);
      expect(evaluation).toHaveProperty(valueProperty, 3);
    });

    it('should return double value if variant toggle exists and is enabled', () => {
      const evaluation = provider.resolveNumberEvaluation('variantToggleDouble', 0);
      expect(evaluation).toHaveProperty(valueProperty, 1.2);
    });

    it('should return default value if a toggle is disabled', () => {
      const evaluation = provider.resolveNumberEvaluation('disabledVariant', 0);
      expect(evaluation).toHaveProperty(valueProperty, 0);
    });

    it('should throw TypeMismatchError if requested variant type is not a number', () => {
      expect(() => provider.resolveNumberEvaluation('variantToggleCsv', 0)).toThrow(TypeMismatchError);
    });
  });

  describe('method resolveObjectEvaluation', () => {
    it('should return default value for missing value', () => {
      const defaultValue = '{"notFound" : true}';
      const evaluation = provider.resolveObjectEvaluation('nonExistent', JSON.parse(defaultValue));
      expect(evaluation).toHaveProperty(valueProperty, JSON.parse(defaultValue));
    });

    it('should return json value if variant toggle exists and is enabled', () => {
      const expectedVariant = '{hello: world}';
      const evaluation = provider.resolveObjectEvaluation('variantToggleJson', JSON.parse('{"default": false}'));
      expect(evaluation).toHaveProperty(valueProperty, expectedVariant);
    });

    it('should return csv value if variant toggle exists and is enabled', () => {
      const evaluation = provider.resolveObjectEvaluation('variantToggleCsv', 'a,b,c,d');
      expect(evaluation).toHaveProperty(valueProperty, '1,2,3,4');
    });

    it('should return default value if a toggle is disabled', () => {
      const defaultValue = '{foo: bar}';
      const evaluation = provider.resolveObjectEvaluation('disabledVariant', defaultValue);
      expect(evaluation).toHaveProperty(valueProperty, defaultValue);
    });

    it('should throw TypeMismatchError if requested variant type is not json or csv', () => {
      expect(() => provider.resolveObjectEvaluation('variantToggleInteger', 'a,b,c,d')).toThrow(TypeMismatchError);
    });
  });
});
