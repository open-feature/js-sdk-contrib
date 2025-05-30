import { ConfigCatWebProvider } from './config-cat-web-provider';
import type { HookEvents, IConfigCatCache, ISettingUnion } from 'configcat-js-ssr';
import { createConsoleLogger, createFlagOverridesFromMap, LogLevel, OverrideBehaviour } from 'configcat-js-ssr';
import type { EventEmitter } from 'events';
import { ProviderEvents, ParseError, FlagNotFoundError, TypeMismatchError } from '@openfeature/web-sdk';

describe('ConfigCatWebProvider', () => {
  const targetingKey = 'abc';

  let provider: ConfigCatWebProvider;
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
    provider = ConfigCatWebProvider.create('__key__', {
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

  it('should be an instance of ConfigCatWebProvider', () => {
    expect(provider).toBeInstanceOf(ConfigCatWebProvider);
  });

  it('should dispose the configcat client on provider closing', async () => {
    const newProvider = ConfigCatWebProvider.create('__another_key__', {
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

  describe('events', () => {
    it('should emit PROVIDER_CONFIGURATION_CHANGED event', () => {
      const handler = jest.fn();
      const eventData = { settings: { myFlag: {} as ISettingUnion }, salt: undefined, segments: [] };

      provider.events.addHandler(ProviderEvents.ConfigurationChanged, handler);
      configCatEmitter.emit('configChanged', eventData);

      expect(handler).toHaveBeenCalledWith({
        flagsChanged: ['myFlag'],
      });
    });

    it("should emit PROVIDER_READY event when underlying client is initialized after provider's initialize", async () => {
      const cacheValue = '253370761200000\nW/"12345678-90a"\n{"f":{"booleanTrue":{"t":0,"v":{"b":true}}}}';

      const fakeSharedCache = new (class implements IConfigCatCache {
        private _value?: string;
        get(key: string) {
          return this._value;
        }
        set(key: string, value: string) {
          this._value = value;
        }
      })();

      const provider = ConfigCatWebProvider.create('configcat-sdk-1/1234567890123456789012/1234567890123456789012', {
        cache: fakeSharedCache,
        logger: createConsoleLogger(LogLevel.Off),
        offline: true,
        maxInitWaitTimeSeconds: 1,
      });

      const readyHandler = jest.fn();
      provider.events.addHandler(ProviderEvents.Ready, readyHandler);

      try {
        await provider.initialize();
      } catch (err) {
        expect((err as Error).message).toContain('underlying ConfigCat client could not initialize');
      }

      expect(readyHandler).toHaveBeenCalledTimes(0);

      fakeSharedCache.set('', cacheValue);

      // Make sure that the internal cache is refreshed.
      await provider.configCatClient?.forceRefreshAsync();

      provider.resolveBooleanEvaluation('booleanTrue', false, { targetingKey });

      // Wait a little while for the Ready event to be emitted.
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(readyHandler).toHaveBeenCalled();
    });
  });

  describe('method resolveBooleanEvaluation', () => {
    it('should throw FlagNotFoundError if type is different than expected', () => {
      expect(() => provider.resolveBooleanEvaluation('nonExistent', false, { targetingKey })).toThrow(
        FlagNotFoundError,
      );
    });

    it('should return right value if key exists', () => {
      const value = provider.resolveBooleanEvaluation('booleanTrue', false, { targetingKey });
      expect(value).toHaveProperty('value', values.booleanTrue);
    });

    it('should throw TypeMismatchError if type is different than expected', () => {
      expect(() => provider.resolveBooleanEvaluation('number1', false, { targetingKey })).toThrow(TypeMismatchError);
    });
  });

  describe('method resolveStringEvaluation', () => {
    it('should throw FlagNotFoundError if type is different than expected', async () => {
      expect(() => provider.resolveStringEvaluation('nonExistent', 'nonExistent', { targetingKey })).toThrow(
        FlagNotFoundError,
      );
    });

    it('should return right value if key exists', () => {
      const value = provider.resolveStringEvaluation('stringTest', 'default', { targetingKey });
      expect(value).toHaveProperty('value', values.stringTest);
    });

    it('should throw TypeMismatchError if type is different than expected', async () => {
      expect(() => provider.resolveStringEvaluation('number1', 'default', { targetingKey })).toThrow(TypeMismatchError);
    });
  });

  describe('method resolveNumberEvaluation', () => {
    it('should throw FlagNotFoundError if type is different than expected', async () => {
      expect(() => provider.resolveNumberEvaluation('nonExistent', 0, { targetingKey })).toThrow(FlagNotFoundError);
    });

    it('should return right value if key exists', () => {
      const value = provider.resolveNumberEvaluation('number1', 0, { targetingKey });
      expect(value).toHaveProperty('value', values.number1);
    });

    it('should throw TypeMismatchError if type is different than expected', () => {
      expect(() => provider.resolveNumberEvaluation('stringTest', 0, { targetingKey })).toThrow(TypeMismatchError);
    });
  });

  describe('method resolveObjectEvaluation', () => {
    it('should throw FlagNotFoundError if type is different than expected', () => {
      expect(() => provider.resolveObjectEvaluation('nonExistent', false, { targetingKey })).toThrow(FlagNotFoundError);
    });

    it('should return right value if key exists', () => {
      const value = provider.resolveObjectEvaluation('jsonValid', {}, { targetingKey });
      expect(value).toHaveProperty('value', JSON.parse(values.jsonValid));
    });

    it('should throw ParseError if string is not valid JSON', () => {
      expect(() => provider.resolveObjectEvaluation('jsonInvalid', {}, { targetingKey })).toThrow(ParseError);
    });

    it('should return right value if key exists and value is only a JSON primitive', () => {
      const value = provider.resolveObjectEvaluation('jsonPrimitive', {}, { targetingKey });
      expect(value).toHaveProperty('value', JSON.parse(values.jsonPrimitive));
    });
  });
});
