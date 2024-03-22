import FlagsmithWebProvider from './flagsmith-provider';
import { IInitConfig } from 'flagsmith/types';
import {
  exampleBooleanFlagName,
  exampleFlagsmithResponse,
  exampleFloatFlagName,
  exampleJSONFlagName,
  exampleNumericFlagName,
  exampleStringFlagName,
  getFetchErrorMock,
  getFetchMock,
} from './flagsmith.mocks';
import { OpenFeature, ProviderEvents, ProviderStatus } from '@openfeature/web-sdk';
import flagsmithIsomorphic, { createFlagsmithInstance } from 'flagsmith/isomorphic';
import { LaunchDarklyClientProvider } from '@openfeature/launchdarkly-client-provider';

const logger = {
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  reset: jest.fn(),
  warn: jest.fn(),
};

const exampleConfig: () => IInitConfig = () => ({
  environmentID: '0p3nf34tur3',
  fetch: getFetchMock(exampleFlagsmithResponse),
});
describe('FlagsmithWebProvider', () => {
  beforeEach(async () => {
    // Clear all instances and calls to constructor and all methods of mock logger
    jest.clearAllMocks();
    await Promise.all([OpenFeature.clearProviders(), OpenFeature.clearContexts()]);
  });

  describe('constructor', () => {
    it('should initialize the environment ID', async () => {
      const config = exampleConfig();
      const provider = new FlagsmithWebProvider(config);
      await OpenFeature.setProviderAndWait(provider);
      expect(provider.flagsmithClient.getState().environmentID).toEqual(config.environmentID);
    });

    it('should allow a custom instance of Flagsmith to be used', async () => {
      const instance = createFlagsmithInstance();
      const provider = new FlagsmithWebProvider({ flagsmithInstance: instance, ...exampleConfig() });
      expect(provider.flagsmithClient).toEqual(instance);
    });
  });
  describe('resolution', () => {
    const client = OpenFeature.getClient();
    const config = exampleConfig();
    const provider = new FlagsmithWebProvider({ ...config });
    it('should resolve booleans to the enabled state', async () => {
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getBooleanDetails(exampleBooleanFlagName, false);
      expect(details.value).toEqual(true);
      expect(details.reason).toEqual('STATIC');
    });
    it('should resolve string values', async () => {
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getStringDetails(exampleStringFlagName, '');
      expect(details.value).toEqual('Hello World');
      expect(details.reason).toEqual('STATIC');
    });
    it('should resolve int values', async () => {
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getNumberDetails(exampleNumericFlagName, 0);
      expect(details.value).toEqual(100);
      expect(details.reason).toEqual('STATIC');
    });
    it('should resolve float values', async () => {
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getNumberDetails(exampleFloatFlagName, 0);
      expect(details.value).toEqual(99.999);
      expect(details.reason).toEqual('STATIC');
    });
    it('should resolve json values', async () => {
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getObjectDetails(exampleJSONFlagName, {});
      expect(details.value).toEqual({ foo: 'bar' });
      expect(details.reason).toEqual('STATIC');
    });
    it('should use defaults for invalid JSON values', async () => {
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getObjectDetails(exampleStringFlagName, { bar: 'foo' });
      expect(details.value).toEqual({ bar: 'foo' });
      expect(details.reason).toEqual('ERROR');
    });
    it('should use defaults for NaN values', async () => {
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getNumberDetails(exampleStringFlagName, 0);
      expect(details.value).toEqual(0);
      expect(details.reason).toEqual('ERROR');
    });
    it('should use defaults for NaN values', async () => {
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getNumberDetails(exampleStringFlagName, 0);
      expect(details.value).toEqual(0);
      expect(details.reason).toEqual('ERROR');
    });
    it('should use defaults for flags that do not exist', async () => {
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getNumberDetails('dont exist', 0);
      expect(details.value).toEqual(0);
      expect(details.reason).toEqual('DEFAULT');
    });
  });
  describe('events', () => {
    it('should call the ready handler when initialized', async () => {
      const config = exampleConfig();
      const provider = new FlagsmithWebProvider({ ...config });
      const readyHandler = jest.fn();
      const errorHandler = jest.fn();
      expect(provider.status).toEqual(ProviderStatus.NOT_READY);
      OpenFeature.getClient().addHandler(ProviderEvents.Ready, readyHandler);
      OpenFeature.getClient().addHandler(ProviderEvents.Error, errorHandler);
      await OpenFeature.setProviderAndWait(provider);
      expect(provider.status).toEqual(ProviderStatus.READY);
      expect(readyHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledTimes(0);
    });
    it('should call the error handler when errored', async () => {
      const config = exampleConfig();
      const provider = new FlagsmithWebProvider({ ...config, environmentID: '' });
      const readyHandler = jest.fn();
      const errorHandler = jest.fn();
      expect(provider.status).toEqual(ProviderStatus.NOT_READY);
      OpenFeature.getClient().addHandler(ProviderEvents.Ready, readyHandler);
      OpenFeature.getClient().addHandler(ProviderEvents.Error, errorHandler);
      await OpenFeature.setProviderAndWait(provider);
      expect(provider.status).toEqual(ProviderStatus.ERROR);
      expect(errorHandler).toHaveBeenCalledTimes(1);
    });
    it('should call the stale handler when context changed', async () => {
      const config = exampleConfig();
      const provider = new FlagsmithWebProvider({ ...config });
      await OpenFeature.setProviderAndWait(provider);
      const staleHandler = jest.fn();
      OpenFeature.getClient().addHandler(ProviderEvents.Stale, staleHandler);
      expect(provider.status).toEqual(ProviderStatus.READY);
      const contextChange = OpenFeature.setContext({ targetingKey: 'test' });
      expect(provider.status).toEqual(ProviderStatus.STALE);
      await contextChange;
      expect(provider.status).toEqual(ProviderStatus.READY);
    });
  });
  describe('context', () => {
    it('should initialize without the targeting key, identify when provided and logout when not provided again', async () => {
      const targetingKey = 'test';
      const config = exampleConfig();
      const provider = new FlagsmithWebProvider({
        logger,
        ...config,
      });
      await OpenFeature.setProviderAndWait(provider);
      expect(provider.flagsmithClient.getState().identity).toEqual(undefined);
      await OpenFeature.setContext({ targetingKey });
      expect(provider.flagsmithClient.getState().identity).toEqual(targetingKey);
      await OpenFeature.setContext({});
      expect(provider.flagsmithClient.getState().identity).toEqual(undefined);
      expect(config.fetch).toHaveBeenNthCalledWith(
        1,
        `${provider.flagsmithClient.getState().api}flags/`,
        expect.objectContaining({
          body: undefined,
        }),
      );
      expect(config.fetch).toHaveBeenNthCalledWith(
        2,
        `${provider.flagsmithClient.getState().api}identities/?identifier=test`,
        expect.objectContaining({
          body: undefined,
        }),
      );
      expect(config.fetch).toHaveBeenNthCalledWith(
        3,
        `${provider.flagsmithClient.getState().api}flags/`,
        expect.objectContaining({
          body: undefined,
        }),
      );
      expect(config.fetch).toHaveBeenCalledTimes(3);
    });
    it('should initialize with the targeting key and traits when passed to initialize', async () => {
      const targetingKey = 'test';
      const traits = { foo: 'bar', example: 123 };
      const config = exampleConfig();
      const provider = new FlagsmithWebProvider(config);
      await OpenFeature.setContext({ targetingKey, traits });
      await OpenFeature.setProviderAndWait(provider);
      expect(provider.flagsmithClient.getState().identity).toEqual(targetingKey);
      expect(config.fetch).toHaveBeenCalledTimes(1);
      expect(config.fetch).toHaveBeenCalledWith(
        `${provider.flagsmithClient.getState().api}identities/`,
        expect.objectContaining({
          body: JSON.stringify({
            identifier: targetingKey,
            traits: [
              {
                trait_key: 'foo',
                trait_value: 'bar',
              },
              {
                trait_key: 'example',
                trait_value: 123,
              },
            ],
          }),
        }),
      );
    });
  });
  describe('common errors', () => {
    it('should throw an error if there was an api error', async () => {
      const config = exampleConfig();
      const provider = new FlagsmithWebProvider({
        ...config,
        logger,
        fetch: getFetchErrorMock(),
      });
      await OpenFeature.setProviderAndWait(provider);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Fetch error'));
    });
    it('should throw an error if there was no Environment ID provided', async () => {
      const config = exampleConfig();
      const provider = new FlagsmithWebProvider({
        logger,
        ...config,
        fetch: getFetchErrorMock(),
        environmentID: '',
      });
      await OpenFeature.setProviderAndWait(provider);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('error invoking action Initialize'));
    });
  });
});
