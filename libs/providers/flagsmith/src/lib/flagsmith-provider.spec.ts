import { FlagsmithProvider } from './flagsmith-provider';
import {
  defaultConfig,
  defaultState,
  exampleBooleanFlag,
  exampleBooleanFlagName,
  exampleFloatFlagName,
  exampleJSONFlagName,
  exampleNumericFlagName,
  exampleStringFlagName,
  getFetchErrorMock,
} from './flagsmith.mocks';
import { OpenFeature, ProviderEvents } from '@openfeature/web-sdk';
import { createFlagsmithInstance } from 'flagsmith';

const logger = {
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  reset: jest.fn(),
  warn: jest.fn(),
};

describe('FlagsmithProvider', () => {
  beforeEach(async () => {
    // Clear all instances and calls to constructor and all methods of mock logger
    jest.clearAllMocks();
    await Promise.all([OpenFeature.clearProviders(), OpenFeature.clearContexts()]);
  });

  describe('constructor', () => {
    it('should initialize the environment ID', async () => {
      const config = defaultConfig();
      const provider = new FlagsmithProvider(config);
      await OpenFeature.setProviderAndWait(provider);
      expect(provider.flagsmithClient.getState().environmentID).toEqual(config.environmentID);
    });

    it('calls onChange', async () => {
      const config = defaultConfig();
      const onChange = jest.fn();
      const provider = new FlagsmithProvider({ ...config, onChange });
      await OpenFeature.setProviderAndWait(provider);
      expect(onChange).toHaveBeenCalledTimes(1);
      await OpenFeature.setContext({ targetingKey: 'test' });
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(provider.flagsmithClient.getState().environmentID).toEqual(config.environmentID);
    });

    it('should allow a custom instance of Flagsmith to be used', async () => {
      const instance = createFlagsmithInstance();
      const provider = new FlagsmithProvider({ flagsmithInstance: instance, ...defaultConfig() });
      expect(provider.flagsmithClient).toEqual(instance);
    });

    it('should initialize with SSR state and evaluate synchronously if provided', async () => {
      const config = defaultConfig();
      const state = {
        ...defaultState,
        identity: 'test',
        traits: { example: 1 },
        evaluationEvent: null,
        ts: null,
      };
      const provider = new FlagsmithProvider({
        logger,
        ...config,
        preventFetch: true,
        state,
      });
      OpenFeature.setProvider(provider);
      expect(provider.flagsmithClient.getState()).toEqual(state);
      const details = OpenFeature.getClient().getNumberDetails(exampleNumericFlagName, 12);
      expect(details.value).toEqual(100);
      expect(details.reason).toEqual('DEFAULT');
    });
  });
  describe('cache', () => {
    it('retrieve features from cache without hitting API', async () => {
      const config = defaultConfig();
      const provider = new FlagsmithProvider({
        ...config,
        logger,
        cacheFlags: true,
        preventFetch: true,
      });
      await config.AsyncStorage.setItem(
        'BULLET_TRAIN_DB',
        JSON.stringify({
          ...defaultState,
        }),
      );
      const client = OpenFeature.getClient();
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getBooleanDetails(exampleBooleanFlagName, false);
      expect(details.reason).toEqual('CACHED');
      expect(details.value).toEqual(true);
    });
    it('doesnt emit event when API matches cache ', async () => {
      const config = defaultConfig();
      const provider = new FlagsmithProvider({
        ...config,
        logger,
        cacheFlags: true,
      });
      await config.AsyncStorage.setItem(
        'BULLET_TRAIN_DB',
        JSON.stringify({
          ...defaultState,
        }),
      );
      const client = OpenFeature.getClient();
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getBooleanDetails(exampleBooleanFlagName, false);
      const changedHandler = jest.fn();
      OpenFeature.addHandler(ProviderEvents.ConfigurationChanged, changedHandler);
      expect(changedHandler).toHaveBeenCalledTimes(0);
      expect(details.reason).toEqual('STATIC');
      expect(details.value).toEqual(true);
    });
    it('emits event when API differs from cache ', async () => {
      const config = defaultConfig();
      const provider = new FlagsmithProvider({
        ...config,
        logger,
        cacheFlags: true,
      });
      await config.AsyncStorage.setItem(
        'BULLET_TRAIN_DB',
        JSON.stringify({
          ...defaultState,
          flags: {
            ...defaultState.flags,
            [exampleBooleanFlag!.feature.name]: {
              id: exampleBooleanFlag!.feature.id,
              enabled: false,
              value: exampleBooleanFlag!.feature_state_value,
            },
          },
        }),
      );
      const client = OpenFeature.getClient();
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getBooleanDetails(exampleBooleanFlagName, false);
      const changedHandler = jest.fn();
      OpenFeature.addHandler(ProviderEvents.Ready, changedHandler);
      expect(changedHandler).toHaveBeenCalledTimes(1);
      expect(details.reason).toEqual('STATIC');
      expect(details.value).toEqual(true);
    });
  });
  describe('defaults', () => {
    it('retrieve features from defaults without hitting API', async () => {
      const config = defaultConfig();
      const provider = new FlagsmithProvider({
        ...config,
        logger,
        preventFetch: true,
        defaultFlags: defaultState.flags,
      });

      const client = OpenFeature.getClient();
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getBooleanDetails(exampleBooleanFlagName, false);
      expect(details.reason).toEqual('DEFAULT');
      expect(details.value).toEqual(true);
    });
    it('doesnt emit event when API matches cache ', async () => {
      const config = defaultConfig();
      const provider = new FlagsmithProvider({
        ...config,
        logger,
        defaultFlags: defaultState.flags,
      });
      await config.AsyncStorage.setItem(
        'BULLET_TRAIN_DB',
        JSON.stringify({
          ...defaultState,
        }),
      );
      const client = OpenFeature.getClient();
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getBooleanDetails(exampleBooleanFlagName, false);
      const changedHandler = jest.fn();
      OpenFeature.addHandler(ProviderEvents.ConfigurationChanged, changedHandler);
      expect(changedHandler).toHaveBeenCalledTimes(0);
      expect(details.reason).toEqual('STATIC');
      expect(details.value).toEqual(true);
    });
    it('emits event when API differs from cache ', async () => {
      const config = defaultConfig();
      const provider = new FlagsmithProvider({
        ...config,
        logger,
        cacheFlags: true,
      });
      await config.AsyncStorage.setItem(
        'BULLET_TRAIN_DB',
        JSON.stringify({
          ...defaultState,
          flags: {
            ...defaultState.flags,
            [exampleBooleanFlag!.feature.name]: {
              id: exampleBooleanFlag!.feature.id,
              enabled: false,
              value: exampleBooleanFlag!.feature_state_value,
            },
          },
        }),
      );
      const client = OpenFeature.getClient();
      await OpenFeature.setProviderAndWait(provider);
      const details = client.getBooleanDetails(exampleBooleanFlagName, false);
      const changedHandler = jest.fn();
      OpenFeature.addHandler(ProviderEvents.Ready, changedHandler);
      expect(changedHandler).toHaveBeenCalledTimes(1);
      expect(details.reason).toEqual('STATIC');
      expect(details.value).toEqual(true);
    });
  });
  describe('flag evaluation', () => {
    const client = OpenFeature.getClient();
    const config = defaultConfig();
    const provider = new FlagsmithProvider({ ...config });
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
      const config = defaultConfig();
      const provider = new FlagsmithProvider({ ...config });
      const readyHandler = jest.fn().mockImplementation(() => {
        return OpenFeature.getClient().getBooleanValue(exampleBooleanFlagName, false);
      });
      const errorHandler = jest.fn();
      OpenFeature.addHandler(ProviderEvents.Ready, readyHandler);
      OpenFeature.addHandler(ProviderEvents.Error, errorHandler);
      await OpenFeature.setProviderAndWait(provider);
      expect(readyHandler).toHaveBeenCalled();
      expect(readyHandler).toHaveReturnedWith(true);
      expect(errorHandler).toHaveBeenCalledTimes(0);
    });
    it('should call the error handler when errored', async () => {
      const config = defaultConfig();
      const provider = new FlagsmithProvider({ ...config, environmentID: '' });
      const readyHandler = jest.fn();
      const errorHandler = jest.fn();
      OpenFeature.addHandler(ProviderEvents.Ready, readyHandler);
      OpenFeature.addHandler(ProviderEvents.Error, errorHandler);
      await OpenFeature.setProviderAndWait(provider);
      expect(errorHandler).toHaveBeenCalledTimes(1);
    });
    it('should call the stale handler when context changed', async () => {
      const config = defaultConfig();
      const provider = new FlagsmithProvider({ ...config });
      await OpenFeature.setProviderAndWait(provider);
      const staleHandler = jest.fn();
      OpenFeature.addHandler(ProviderEvents.Stale, staleHandler);
      const contextChange = OpenFeature.setContext({ targetingKey: 'test' });
      await contextChange;
    });
  });
  describe('context', () => {
    it('should initialize without the targeting key, identify when provided and logout when not provided again', async () => {
      const targetingKey = 'test';
      const config = defaultConfig();
      const provider = new FlagsmithProvider({
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
        `${provider.flagsmithClient.getState().api}identities/`,
        expect.objectContaining({
          body: '{"identifier":"test","traits":[]}',
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
      const config = defaultConfig();
      const provider = new FlagsmithProvider(config);
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
  describe('server state', () => {
    it('should initialize with the targeting key and traits when passed to initialize', async () => {
      const targetingKey = 'test';
      const traits = { foo: 'bar', example: 123 };
      const config = defaultConfig();
      const provider = new FlagsmithProvider(config);
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
      const config = defaultConfig();
      const provider = new FlagsmithProvider({
        ...config,
        logger,
        fetch: getFetchErrorMock(),
      });
      await OpenFeature.setProviderAndWait(provider);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Fetch error'));
    });
    it('should throw an error if there was no Environment ID provided', async () => {
      const config = defaultConfig();
      const provider = new FlagsmithProvider({
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
