import { ConfigCatProvider } from './config-cat-provider';
import { ParseError, ProviderEvents, ProviderStatus, TypeMismatchError } from '@openfeature/server-sdk';
import {
  ClientCacheState,
  createConsoleLogger,
  createFlagOverridesFromMap,
  HookEvents,
  ISettingUnion,
  LogLevel,
  OverrideBehaviour,
  PollingMode,
} from 'configcat-js-ssr';
import { EventEmitter } from 'events';

describe('ConfigCatProvider', () => {
  const targetingKey = 'abc';

  let provider: ConfigCatProvider;
  let configCatEmitter: EventEmitter<HookEvents>;

  const values = {
    booleanFalse: false,
    booleanTrue: true,
    number1: 1,
    number2: 2,
    stringTest: 'Test',
    jsonValid: JSON.stringify({ valid: true }),
    jsonInvalid: '{test:123',
    jsonPrimitive: JSON.stringify(123),
  };

  beforeAll(async () => {
    provider = ConfigCatProvider.create('__key__', PollingMode.ManualPoll, {
      logger: createConsoleLogger(LogLevel.Off),
      offline: true,
      flagOverrides: createFlagOverridesFromMap(values, OverrideBehaviour.LocalOnly),
    });

    await provider.initialize();

    // Currently there is no option to get access to the event emitter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    configCatEmitter = (provider.configCatClient as any).options.hooks;
  });

  afterAll(async () => {
    await provider.onClose();
  });

  it('should be an instance of ConfigCatProvider', () => {
    expect(provider).toBeInstanceOf(ConfigCatProvider);
  });

  it('should dispose the configcat client on provider closing', async () => {
    const newProvider = ConfigCatProvider.create('__another_key__', PollingMode.AutoPoll, {
      logger: createConsoleLogger(LogLevel.Off),
      offline: true,
      flagOverrides: createFlagOverridesFromMap(values, OverrideBehaviour.LocalOnly),
    });

    await newProvider.initialize();

    if (!newProvider.configCatClient) {
      throw Error('No ConfigCat client');
    }

    const clientDisposeSpy = jest.spyOn(newProvider.configCatClient, 'dispose');
    await newProvider.onClose();

    expect(clientDisposeSpy).toHaveBeenCalled();
  });

  describe('status', () => {
    it('should be NOT_READY before initialization and READY after successful initialization', async () => {
      const newProvider = ConfigCatProvider.create('wrong_key', PollingMode.ManualPoll, {
        logger: createConsoleLogger(LogLevel.Off),
        offline: true,
        flagOverrides: createFlagOverridesFromMap(values, OverrideBehaviour.LocalOnly),
      });

      expect(newProvider.status).toEqual(ProviderStatus.NOT_READY);
      await newProvider.initialize();
      expect(newProvider.status).toEqual(ProviderStatus.READY);
    });

    it('should set status to ERROR if an error occurs', async () => {
      configCatEmitter.emit('clientError', 'Error');
      expect(provider.status).toEqual(ProviderStatus.ERROR);
    });

    it('should set status back to READY if client switches back to ready after an error occured', async () => {
      configCatEmitter.emit('clientError', 'Error');
      expect(provider.status).toEqual(ProviderStatus.ERROR);
      configCatEmitter.emit('clientReady', ClientCacheState.HasCachedFlagDataOnly);
      expect(provider.status).toEqual(ProviderStatus.READY);
    });
  });

  describe('events', () => {
    it('should emit PROVIDER_READY event', () => {
      const handler = jest.fn();
      provider.events.addHandler(ProviderEvents.Ready, handler);
      configCatEmitter.emit('clientReady', ClientCacheState.HasCachedFlagDataOnly);
      expect(handler).toHaveBeenCalled();
    });

    it('should emit PROVIDER_READY event on initialization', async () => {
      const newProvider = ConfigCatProvider.create('__another_key__', PollingMode.ManualPoll, {
        logger: createConsoleLogger(LogLevel.Off),
        offline: true,
        flagOverrides: createFlagOverridesFromMap(values, OverrideBehaviour.LocalOnly),
      });

      const handler = jest.fn();
      newProvider.events.addHandler(ProviderEvents.Ready, handler);
      await newProvider.initialize();

      expect(handler).toHaveBeenCalled();
    });

    it('should emit PROVIDER_READY event without options', async () => {
      const newProvider = ConfigCatProvider.create('__yet_another_key__', PollingMode.ManualPoll, {
        flagOverrides: createFlagOverridesFromMap(values, OverrideBehaviour.LocalOnly),
      });

      const handler = jest.fn();
      newProvider.events.addHandler(ProviderEvents.Ready, handler);
      await newProvider.initialize();

      expect(handler).toHaveBeenCalled();
    });

    it('should emit PROVIDER_CONFIGURATION_CHANGED event', () => {
      const handler = jest.fn();
      const eventData = { settings: { myFlag: {} as ISettingUnion }, salt: undefined, segments: [] };

      provider.events.addHandler(ProviderEvents.ConfigurationChanged, handler);
      configCatEmitter.emit('configChanged', eventData);

      expect(handler).toHaveBeenCalledWith({
        flagsChanged: ['myFlag'],
      });
    });

    it('should emit PROVIDER_ERROR event', () => {
      const handler = jest.fn();
      const eventData: [string, unknown] = ['error', { error: 'error' }];

      provider.events.addHandler(ProviderEvents.Error, handler);
      configCatEmitter.emit('clientError', ...eventData);

      expect(handler).toHaveBeenCalledWith({
        message: eventData[0],
        metadata: eventData[1],
      });
    });
  });

  describe('method resolveBooleanEvaluation', () => {
    it('should return default value for missing value', async () => {
      const value = await provider.resolveBooleanEvaluation('nonExistent', false, { targetingKey });
      expect(value).toHaveProperty('value', false);
    });

    it('should return right value if key exists', async () => {
      const value = await provider.resolveBooleanEvaluation('booleanTrue', false, { targetingKey });
      expect(value).toHaveProperty('value', values.booleanTrue);
    });

    it('should throw TypeMismatchError if type is different than expected', async () => {
      await expect(provider.resolveBooleanEvaluation('number1', false, { targetingKey })).rejects.toThrow(
        TypeMismatchError,
      );
    });
  });

  describe('method resolveStringEvaluation', () => {
    it('should return default value for missing value', async () => {
      const value = await provider.resolveStringEvaluation('nonExistent', 'default', { targetingKey });
      expect(value).toHaveProperty('value', 'default');
    });

    it('should return right value if key exists', async () => {
      const value = await provider.resolveStringEvaluation('stringTest', 'default', { targetingKey });
      expect(value).toHaveProperty('value', values.stringTest);
    });

    it('should throw TypeMismatchError if type is different than expected', async () => {
      await expect(provider.resolveStringEvaluation('number1', 'default', { targetingKey })).rejects.toThrow(
        TypeMismatchError,
      );
    });
  });

  describe('method resolveNumberEvaluation', () => {
    it('should return default value for missing value', async () => {
      const value = await provider.resolveNumberEvaluation('nonExistent', 0, { targetingKey });
      expect(value).toHaveProperty('value', 0);
    });

    it('should return right value if key exists', async () => {
      const value = await provider.resolveNumberEvaluation('number1', 0, { targetingKey });
      expect(value).toHaveProperty('value', values.number1);
    });

    it('should throw TypeMismatchError if type is different than expected', async () => {
      await expect(provider.resolveNumberEvaluation('stringTest', 0, { targetingKey })).rejects.toThrow(
        TypeMismatchError,
      );
    });
  });

  describe('method resolveObjectEvaluation', () => {
    it('should return default value for missing value', async () => {
      const value = await provider.resolveObjectEvaluation('nonExistent', {}, { targetingKey });
      expect(value).toHaveProperty('value', {});
    });

    it('should return right value if key exists', async () => {
      const value = await provider.resolveObjectEvaluation('jsonValid', {}, { targetingKey });
      expect(value).toHaveProperty('value', JSON.parse(values.jsonValid));
    });

    it('should throw ParseError if string is not valid JSON', async () => {
      await expect(provider.resolveObjectEvaluation('jsonInvalid', {}, { targetingKey })).rejects.toThrow(ParseError);
    });

    it('should throw TypeMismatchError if string is only a JSON primitive', async () => {
      await expect(provider.resolveObjectEvaluation('jsonPrimitive', {}, { targetingKey })).rejects.toThrow(
        TypeMismatchError,
      );
    });
  });
});
