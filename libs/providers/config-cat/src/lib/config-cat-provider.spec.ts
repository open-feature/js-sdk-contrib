import { ConfigCatProvider } from './config-cat-provider';
import { ParseError, ProviderEvents, TypeMismatchError } from '@openfeature/js-sdk';
import {
  createConsoleLogger,
  createFlagOverridesFromMap,
  IConfigCatClient,
  LogLevel,
  OverrideBehaviour,
  PollingMode,
  HookEvents,
  ProjectConfig,
  getClient,
} from 'configcat-js';

import * as configcatcommon from 'configcat-common';
import { HttpConfigFetcher } from 'configcat-js/lib/ConfigFetcher';
import CONFIGCAT_SDK_VERSION from 'configcat-js/lib/Version';
import { IEventEmitter } from 'configcat-common/lib/EventEmitter';

import { EventEmitter } from 'events';

describe('ConfigCatProvider', () => {
  const targetingKey = 'abc';

  let client: IConfigCatClient;
  let provider: ConfigCatProvider;
  let configCatEmitter: IEventEmitter<HookEvents>;

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
    client = configcatcommon.getClient(
      '__key__',
      PollingMode.AutoPoll,
      {
        logger: createConsoleLogger(LogLevel.Off),
        offline: true,
        flagOverrides: createFlagOverridesFromMap(values, OverrideBehaviour.LocalOnly),
      },
      {
        configFetcher: new HttpConfigFetcher(),
        sdkType: 'ConfigCat-JS',
        sdkVersion: CONFIGCAT_SDK_VERSION,
        eventEmitterFactory() {
          configCatEmitter = new EventEmitter() as IEventEmitter<HookEvents>;
          return configCatEmitter;
        },
      }
    );

    provider = ConfigCatProvider.createFromClient(client);
    await provider.initialize()
  });

  afterAll(() => {
    client.dispose();
  });

  it('should be an instance of ConfigCatProvider', () => {
    expect(provider).toBeInstanceOf(ConfigCatProvider);
  });

  it('should dispose the configcat client on provider closing', async () => {
    const newClient = getClient('__another_key__', PollingMode.AutoPoll, {
      logger: createConsoleLogger(LogLevel.Off),
      offline: true,
      flagOverrides: createFlagOverridesFromMap(values, OverrideBehaviour.LocalOnly),
    });

    const clientDisposeSpy = jest.spyOn(newClient, 'dispose');
    const newProvider = ConfigCatProvider.createFromClient(newClient);
    await newProvider.onClose();

    expect(clientDisposeSpy).toHaveBeenCalled();
  });

  describe('events', () => {
    it('should emit PROVIDER_READY event', () => {
      const handler = jest.fn();

      provider.events.addHandler(ProviderEvents.Ready, handler);
      configCatEmitter.emit('clientReady');

      expect(handler).toHaveBeenCalled();
    });

    it('should emit PROVIDER_CONFIGURATION_CHANGED event', () => {
      const handler = jest.fn();
      const eventData = new ProjectConfig(1, {});

      provider.events.addHandler(ProviderEvents.ConfigurationChanged, handler);
      configCatEmitter.emit('configChanged', eventData);

      expect(handler).toHaveBeenCalledWith({
        metadata: eventData,
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
        TypeMismatchError
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
        TypeMismatchError
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
        TypeMismatchError
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
        TypeMismatchError
      );
    });
  });
});
