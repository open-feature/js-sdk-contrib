import FlagsmithOpenFeatureProvider from './flagsmith-provider';
import {
  FlagNotFoundError,
  TypeMismatchError,
  Logger,
  StandardResolutionReasons,
  ProviderEvents,
  ProviderStatus,
  ErrorCode,
} from '@openfeature/server-sdk';
import { Flagsmith, Flags, BaseFlag } from 'flagsmith-nodejs';
import { FlagsmithProviderError } from './exceptions';
import { mockFlagData } from './flagsmith.mocks';

jest.mock('flagsmith-nodejs');

const loggerMock: Logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('FlagsmithOpenFeatureProvider', () => {
  let defaultProvider: FlagsmithOpenFeatureProvider;
  let mockFlagsmith: jest.Mocked<Flagsmith>;
  let mockFlags: jest.Mocked<Flags>;

  const targetingKey = 'test-user-123';
  const evaluationContext = { targetingKey };

  beforeEach(() => {
    mockFlags = {
      getFlag: jest.fn(),
    } as unknown as jest.Mocked<Flags>;

    mockFlagsmith = {
      getEnvironmentFlags: jest.fn().mockResolvedValue(mockFlags),
      getIdentityFlags: jest.fn().mockResolvedValue(mockFlags),
    } as unknown as jest.Mocked<Flagsmith>;

    defaultProvider = new FlagsmithOpenFeatureProvider(mockFlagsmith, {
      returnValueForDisabledFlags: false,
      useFlagsmithDefaults: false,
      useBooleanConfigValue: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider instance with correct metadata', () => {
      expect(defaultProvider).toBeInstanceOf(FlagsmithOpenFeatureProvider);
      expect(defaultProvider.metadata).toEqual({
        name: 'flagsmith-provider',
      });
    });

    it('should set correct runsOn property', () => {
      expect(defaultProvider.runsOn).toEqual('server');
    });
  });

  describe('provider status and events', () => {
    it('should start with NOT_READY status', () => {
      const provider = new FlagsmithOpenFeatureProvider(mockFlagsmith);
      expect(provider.status).toBe(ProviderStatus.NOT_READY);
    });

    it('should set status to READY after successful initialization', async () => {
      const provider = new FlagsmithOpenFeatureProvider(mockFlagsmith);
      mockFlagsmith.getEnvironmentFlags.mockResolvedValue(mockFlags);

      await provider.initialize();

      expect(provider.status).toBe(ProviderStatus.READY);
    });

    it('should set status to ERROR when initialization fails', async () => {
      const provider = new FlagsmithOpenFeatureProvider(mockFlagsmith);
      mockFlagsmith.getEnvironmentFlags.mockRejectedValue(new Error('Connection failed'));

      await expect(provider.initialize()).rejects.toThrow();
      expect(provider.status).toBe(ProviderStatus.ERROR);
    });

    it('should emit ready event when status changes to READY', async () => {
      const provider = new FlagsmithOpenFeatureProvider(mockFlagsmith);
      const readyHandler = jest.fn();
      provider.events.addHandler(ProviderEvents.Ready, readyHandler);

      mockFlagsmith.getEnvironmentFlags.mockResolvedValue(mockFlags);
      await provider.initialize();

      expect(readyHandler).toHaveBeenCalled();
    });

    it('should emit error event when status changes to ERROR', async () => {
      const provider = new FlagsmithOpenFeatureProvider(mockFlagsmith);
      const errorHandler = jest.fn();
      provider.events.addHandler(ProviderEvents.Error, errorHandler);

      mockFlagsmith.getEnvironmentFlags.mockRejectedValue(new Error('Connection failed'));

      try {
        await provider.initialize();
      } catch (error) {}

      expect(errorHandler).toHaveBeenCalled();
    });

    it('should set status to NOT_READY when onClose is called', async () => {
      const provider = new FlagsmithOpenFeatureProvider(mockFlagsmith);
      mockFlagsmith.getEnvironmentFlags.mockResolvedValue(mockFlags);

      await provider.initialize();
      expect(provider.status).toBe(ProviderStatus.READY);

      await provider.onClose();
      expect(provider.status).toBe(ProviderStatus.NOT_READY);
    });
  });

  describe('configuration', () => {
    describe('useBooleanConfigValue', () => {
      let useBooleanConfigProvider: FlagsmithOpenFeatureProvider;
      beforeEach(() => {
        useBooleanConfigProvider = new FlagsmithOpenFeatureProvider(mockFlagsmith, {
          returnValueForDisabledFlags: true,
          useFlagsmithDefaults: false,
          useBooleanConfigValue: true,
        });
      });

      it('should return flag.enabled for a string boolean type when useBooleanConfigValue is false', async () => {
        mockFlags.getFlag.mockReturnValue(mockFlagData.booleanAsStringEnabled);
        const result = await useBooleanConfigProvider.resolveBooleanEvaluation(
          'test-flag',
          false,
          evaluationContext,
          loggerMock,
        );
        expect(result.value).toBe(true);
        expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      });

      it('should return flag.enabled for a boolean type when useBooleanConfigValue is false', async () => {
        mockFlags.getFlag.mockReturnValue(mockFlagData.booleanDisabled);
        const result = await useBooleanConfigProvider.resolveBooleanEvaluation(
          'test-flag',
          false,
          evaluationContext,
          loggerMock,
        );
        expect(result.value).toBe(false);
        expect(result.reason).toBe(StandardResolutionReasons.DISABLED);
      });

      it('should return default value with error details when flag value type does not match requested type', async () => {
        mockFlags.getFlag.mockReturnValue(mockFlagData.jsonValidFlag);
        const result = await useBooleanConfigProvider.resolveBooleanEvaluation(
          'disabled-flag',
          false,
          evaluationContext,
          loggerMock,
        );
        expect(result.value).toBe(false);
        expect(result.reason).toBe(StandardResolutionReasons.ERROR);
        expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
        expect(result.errorMessage).toContain('is not of type boolean');
      });

      describe('useFlagsmithDefaults', () => {
        it('should throw FlagNotFoundError when flag is default and useFlagsmithDefaults is false', async () => {
          const useFlagsmithDefaultsProvider = new FlagsmithOpenFeatureProvider(mockFlagsmith, {
            returnValueForDisabledFlags: false,
            useFlagsmithDefaults: false,
            useBooleanConfigValue: false,
          });
          mockFlags.getFlag.mockReturnValue(mockFlagData.booleanDefault);
          await expect(
            useFlagsmithDefaultsProvider.resolveBooleanEvaluation('default-flag', false, evaluationContext, loggerMock),
          ).rejects.toThrow(FlagNotFoundError);
        });

        it('should throw FlagNotFoundError when flag does not exist (undefined) even with useFlagsmithDefaults true', async () => {
          const provider = new FlagsmithOpenFeatureProvider(mockFlagsmith, {
            returnValueForDisabledFlags: false,
            useFlagsmithDefaults: true,
            useBooleanConfigValue: false,
          });
          mockFlags.getFlag.mockReturnValue(undefined as any);
          await expect(
            provider.resolveBooleanEvaluation('nonexistent-flag', false, evaluationContext, loggerMock),
          ).rejects.toThrow(FlagNotFoundError);
        });

        it('should return flag.value when boolean flag is default and useFlagsmithDefaults is true', async () => {
          const useFlagsmithDefaultsProvider = new FlagsmithOpenFeatureProvider(mockFlagsmith, {
            returnValueForDisabledFlags: false,
            useFlagsmithDefaults: true,
            useBooleanConfigValue: true,
          });
          mockFlags.getFlag.mockReturnValue(mockFlagData.booleanDefault);
          const result = await useFlagsmithDefaultsProvider.resolveBooleanEvaluation(
            'default-flag',
            false,
            evaluationContext,
            loggerMock,
          );
          expect(result.value).toBe(false);
          expect(result.reason).toBe(StandardResolutionReasons.DEFAULT);
        });

        it('should return flag.value when string flag is default and useFlagsmithDefaults is true', async () => {
          const useFlagsmithDefaultsProvider = new FlagsmithOpenFeatureProvider(mockFlagsmith, {
            returnValueForDisabledFlags: false,
            useFlagsmithDefaults: true,
            useBooleanConfigValue: true,
          });
          mockFlags.getFlag.mockReturnValue(mockFlagData.stringDefault);
          const result = await useFlagsmithDefaultsProvider.resolveStringEvaluation(
            'default-flag',
            '',
            evaluationContext,
            loggerMock,
          );
          expect(result.value).toBe('default-value');
          expect(result.reason).toBe(StandardResolutionReasons.DEFAULT);
        });
      });
    });

    describe('returnValueForDisabledFlags', () => {
      it('should return flag value when boolean flag is disabled and returnValueForDisabledFlags is true', async () => {
        const returnValueForDisabledFlagsProvider = new FlagsmithOpenFeatureProvider(mockFlagsmith, {
          returnValueForDisabledFlags: true,
          useFlagsmithDefaults: false,
          useBooleanConfigValue: false,
        });
        mockFlags.getFlag.mockReturnValue(mockFlagData.booleanDisabled);
        const result = await returnValueForDisabledFlagsProvider.resolveBooleanEvaluation(
          'not-exist-flag',
          false,
          evaluationContext,
          loggerMock,
        );
        expect(result.value).toBe(false);
        expect(result.reason).toBe(StandardResolutionReasons.DISABLED);
      });

      it('should throw FlagsmithProviderError when string flag is disabled and returnValueForDisabledFlags is false', async () => {
        mockFlags.getFlag.mockReturnValue(mockFlagData.disabledFlag);
        await expect(
          defaultProvider.resolveStringEvaluation('disabled-flag', 'test-string', evaluationContext, loggerMock),
        ).rejects.toThrow(FlagsmithProviderError);
      });

      it('should return string value when flag is disabled and returnValueForDisabledFlags is true', async () => {
        const provider = new FlagsmithOpenFeatureProvider(mockFlagsmith, {
          returnValueForDisabledFlags: true,
        });
        mockFlags.getFlag.mockReturnValue(mockFlagData.disabledFlag);
        const result = await provider.resolveStringEvaluation(
          'disabled-flag',
          'default',
          evaluationContext,
          loggerMock,
        );
        expect(result.value).toBe('disabled-value');
        expect(result.reason).toBe(StandardResolutionReasons.DISABLED);
      });
    });
  });

  describe('getFlags', () => {
    it('should call getIdentityFlags when targetingKey is provided', async () => {
      mockFlags.getFlag.mockReturnValue(mockFlagData.booleanAsStringEnabled);

      await defaultProvider.resolveBooleanEvaluation('test-flag', false, evaluationContext, loggerMock);

      expect(mockFlagsmith.getIdentityFlags).toHaveBeenCalledWith(evaluationContext.targetingKey, {});
      expect(mockFlagsmith.getEnvironmentFlags).not.toHaveBeenCalled();
    });

    it('should call getEnvironmentFlags when no targetingKey is provided', async () => {
      mockFlags.getFlag.mockReturnValue(mockFlagData.booleanAsStringEnabled);

      await defaultProvider.resolveBooleanEvaluation('test-flag', false, {}, loggerMock);

      expect(mockFlagsmith.getEnvironmentFlags).toHaveBeenCalled();
      expect(mockFlagsmith.getIdentityFlags).not.toHaveBeenCalled();
    });

    it('should pass traits to getIdentityFlags when provided', async () => {
      mockFlags.getFlag.mockReturnValue(mockFlagData.booleanAsStringEnabled);

      await defaultProvider.resolveBooleanEvaluation(
        'test-flag',
        false,
        { ...evaluationContext, traits: { premium: true, age: 20, name: 'John Doe' } },
        loggerMock,
      );

      expect(mockFlagsmith.getIdentityFlags).toHaveBeenCalledWith(evaluationContext.targetingKey, {
        premium: true,
        age: 20,
        name: 'John Doe',
      });
    });
  });

  describe('resolvers', () => {
    describe('resolveBooleanEvaluation', () => {
      it('should return flag.enabled with enabled boolean flag', async () => {
        mockFlags.getFlag.mockReturnValue(mockFlagData.booleanEnabled);
        const result = await defaultProvider.resolveBooleanEvaluation(
          'test-flag',
          false,
          evaluationContext,
          loggerMock,
        );
        expect(result.value).toBe(true);
        expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      });

      it('should return flag.enabled with disabled boolean flag and returnValueForDisabledFlags is true', async () => {
        const booleanConfigProvider = new FlagsmithOpenFeatureProvider(mockFlagsmith, {
          returnValueForDisabledFlags: true,
          useFlagsmithDefaults: false,
          useBooleanConfigValue: false,
        });
        mockFlags.getFlag.mockReturnValue(mockFlagData.booleanDisabled);
        const result = await booleanConfigProvider.resolveBooleanEvaluation(
          'test-flag',
          false,
          evaluationContext,
          loggerMock,
        );
        expect(result.value).toBe(false);
        expect(result.reason).toBe(StandardResolutionReasons.DISABLED);
      });

      it('should return flag.enabled with disabled boolean flag and returnValueForDisabledFlags (default) is false', async () => {
        mockFlags.getFlag.mockReturnValue(mockFlagData.booleanDisabled);
        const result = await defaultProvider.resolveBooleanEvaluation(
          'test-flag',
          false,
          evaluationContext,
          loggerMock,
        );
        expect(result.value).toBe(false);
        expect(result.reason).toBe(StandardResolutionReasons.DISABLED);
      });

      it('should return default value with error details when flag value type does not match requested type', async () => {
        const booleanConfigProvider = new FlagsmithOpenFeatureProvider(mockFlagsmith, {
          returnValueForDisabledFlags: false,
          useFlagsmithDefaults: false,
          useBooleanConfigValue: true,
        });
        mockFlags.getFlag.mockReturnValue(mockFlagData.stringFlag);
        const result = await booleanConfigProvider.resolveBooleanEvaluation(
          'test-flag',
          false,
          evaluationContext,
          loggerMock,
        );
        expect(result.value).toBe(false);
        expect(result.reason).toBe(StandardResolutionReasons.ERROR);
        expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
        expect(result.errorMessage).toContain('is not of type boolean');
      });

      it('should return false when flag value is numeric 0', async () => {
        const booleanConfigProvider = new FlagsmithOpenFeatureProvider(mockFlagsmith, {
          returnValueForDisabledFlags: false,
          useFlagsmithDefaults: false,
          useBooleanConfigValue: true,
        });
        mockFlags.getFlag.mockReturnValue({
          enabled: true,
          value: 0,
          isDefault: false,
        } as BaseFlag);
        const result = await booleanConfigProvider.resolveBooleanEvaluation(
          'test-flag',
          true,
          evaluationContext,
          loggerMock,
        );
        expect(result.value).toBe(false);
        expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      });

      it('should return true when flag value is numeric 1', async () => {
        const booleanConfigProvider = new FlagsmithOpenFeatureProvider(mockFlagsmith, {
          returnValueForDisabledFlags: false,
          useFlagsmithDefaults: false,
          useBooleanConfigValue: true,
        });
        mockFlags.getFlag.mockReturnValue({
          enabled: true,
          value: 1,
          isDefault: false,
        } as BaseFlag);
        const result = await booleanConfigProvider.resolveBooleanEvaluation(
          'test-flag',
          false,
          evaluationContext,
          loggerMock,
        );
        expect(result.value).toBe(true);
        expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      });
    });

    describe('resolveStringEvaluation', () => {
      it('should return flag.value with enabled string flag', async () => {
        mockFlags.getFlag.mockReturnValue(mockFlagData.stringFlag);
        const result = await defaultProvider.resolveStringEvaluation('test-flag', '', evaluationContext, loggerMock);
        expect(result.value).toBe('test-string-value');
        expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      });

      it('should throw flag is not enabled with disabled string flag and returnValueForDisabledFlags is false (default)', async () => {
        mockFlags.getFlag.mockReturnValue(mockFlagData.disabledFlag);
        await expect(
          defaultProvider.resolveStringEvaluation('test-flag', '', evaluationContext, loggerMock),
        ).rejects.toThrow(FlagsmithProviderError);
      });

      it('should return default value with error details when flag value is undefined', async () => {
        mockFlags.getFlag.mockReturnValue({
          enabled: true,
          value: undefined,
          isDefault: false,
        } as BaseFlag);
        const result = await defaultProvider.resolveStringEvaluation(
          'test-flag',
          'default-string',
          evaluationContext,
          loggerMock,
        );
        expect(result.value).toBe('default-string');
        expect(result.reason).toBe(StandardResolutionReasons.ERROR);
        expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
        expect(result.errorMessage).toContain('is not of type string');
      });

      it('should return a string when flag value is number', async () => {
        mockFlags.getFlag.mockReturnValue(mockFlagData.numberAsStringFlag);
        const result = await defaultProvider.resolveStringEvaluation('test-flag', '', evaluationContext, loggerMock);
        expect(result.value).toBe('42');
        expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      });

      it('should return a string when flag value is JSON', async () => {
        mockFlags.getFlag.mockReturnValue(mockFlagData.jsonValidFlag);
        const result = await defaultProvider.resolveStringEvaluation('test-flag', '', evaluationContext, loggerMock);
        expect(result.value).toBe('{\"key\": \"value\", \"nested\": {\"prop\": true}}');
        expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      });
    });

    describe('resolveNumberEvaluation', () => {
      it('should return a number when flag value is number', async () => {
        mockFlags.getFlag.mockReturnValue(mockFlagData.numberActual);
        const result = await defaultProvider.resolveNumberEvaluation('test-flag', 0, evaluationContext, loggerMock);
        expect(result.value).toBe(123);
        expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      });

      it('should return default value with error details when flag value is not a valid number', async () => {
        mockFlags.getFlag.mockReturnValue(mockFlagData.stringFlag);
        const result = await defaultProvider.resolveNumberEvaluation('test-flag', 42, evaluationContext, loggerMock);
        expect(result.value).toBe(42);
        expect(result.reason).toBe(StandardResolutionReasons.ERROR);
        expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
        expect(result.errorMessage).toContain('is not of type number');
      });

      it('should return default value with error details when flag value is not a valid number string', async () => {
        mockFlags.getFlag.mockReturnValue({
          enabled: true,
          value: 'not-a-number',
          isDefault: false,
        });
        const result = await defaultProvider.resolveNumberEvaluation('test-flag', 99, evaluationContext, loggerMock);
        expect(result.value).toBe(99);
        expect(result.reason).toBe(StandardResolutionReasons.ERROR);
        expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
        expect(result.errorMessage).toContain('is not of type number');
      });

      it('should return a number when flag value is a string with whitespace', async () => {
        mockFlags.getFlag.mockReturnValue({
          enabled: true,
          value: ' 42 ',
          isDefault: false,
        } as BaseFlag);
        const result = await defaultProvider.resolveNumberEvaluation('test-flag', 0, evaluationContext, loggerMock);
        expect(result.value).toBe(42);
        expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      });
    });

    describe('resolveObjectEvaluation', () => {
      it('should return a object when flag value is JSON', async () => {
        mockFlags.getFlag.mockReturnValue(mockFlagData.jsonValidFlag);
        const result = await defaultProvider.resolveObjectEvaluation('test-flag', {}, evaluationContext, loggerMock);
        expect(result.value).toEqual({ key: 'value', nested: { prop: true } });
        expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      });

      it('should return default value with error details when flag value is invalid JSON', async () => {
        mockFlags.getFlag.mockReturnValue(mockFlagData.jsonInvalidFlag);
        const defaultObj = { default: true };
        const result = await defaultProvider.resolveObjectEvaluation(
          'test-flag',
          defaultObj,
          evaluationContext,
          loggerMock,
        );
        expect(result.value).toEqual(defaultObj);
        expect(result.reason).toBe(StandardResolutionReasons.ERROR);
        expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
        expect(result.errorMessage).toContain('is not of type object');
      });

      it('should return default value with error details when flag value is undefined', async () => {
        mockFlags.getFlag.mockReturnValue({
          enabled: true,
          value: undefined,
          isDefault: false,
        } as BaseFlag);
        const defaultObj = { fallback: 'value' };
        const result = await defaultProvider.resolveObjectEvaluation(
          'test-flag',
          defaultObj,
          evaluationContext,
          loggerMock,
        );
        expect(result.value).toEqual(defaultObj);
        expect(result.reason).toBe(StandardResolutionReasons.ERROR);
        expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
        expect(result.errorMessage).toContain('is not of type object');
      });
    });

    describe('error handling', () => {
      it('should throw FlagsmithProviderError when client throws error', async () => {
        mockFlagsmith.getIdentityFlags.mockRejectedValue(new Error('test error'));

        await expect(
          defaultProvider.resolveBooleanEvaluation('test-flag', false, evaluationContext, loggerMock),
        ).rejects.toThrow(FlagsmithProviderError);
      });

      it('should throw FlagNotFoundError when flag is not found and returnValueForDisabledFlags is false', async () => {
        const provider = new FlagsmithOpenFeatureProvider(mockFlagsmith, {
          returnValueForDisabledFlags: false,
          useFlagsmithDefaults: false,
          useBooleanConfigValue: false,
        });
        mockFlagsmith.getIdentityFlags.mockRejectedValue(new Error('not found'));
        await expect(provider.resolveBooleanEvaluation('not-exist', false, {}, loggerMock)).rejects.toThrow(
          FlagNotFoundError,
        );
      });

      it('should return default value with error details when flag value type does not match requested type', async () => {
        const provider = new FlagsmithOpenFeatureProvider(mockFlagsmith, {
          returnValueForDisabledFlags: false,
          useFlagsmithDefaults: false,
          useBooleanConfigValue: true,
        });
        mockFlags.getFlag.mockReturnValue(mockFlagData.stringFlag);
        const result = await provider.resolveBooleanEvaluation('test-flag', false, evaluationContext, loggerMock);
        expect(result.value).toBe(false);
        expect(result.reason).toBe(StandardResolutionReasons.ERROR);
        expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
        expect(result.errorMessage).toContain('is not of type boolean');
      });
    });
  });
});
