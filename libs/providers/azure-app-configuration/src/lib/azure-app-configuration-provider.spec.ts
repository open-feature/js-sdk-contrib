import {
  ErrorCode,
  ProviderEvents,
  ProviderNotReadyError,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/server-sdk';
import { load } from '@azure/app-configuration-provider';
import { ConfigurationMapFeatureFlagProvider, FeatureManager } from '@microsoft/feature-management';

const variant = (name: string, configuration: unknown) => ({ name, configuration });
import { AzureAppConfigurationProvider } from './azure-app-configuration-provider';
import type { AzureAppConfigurationProviderConfig } from './types';

jest.mock('@azure/app-configuration-provider', () => {
  const actual = jest.requireActual('@azure/app-configuration-provider');
  return {
    ...actual,
    load: jest.fn(),
  };
});

jest.mock('@microsoft/feature-management', () => {
  const actual = jest.requireActual('@microsoft/feature-management');
  return {
    ...actual,
    FeatureManager: jest.fn(),
    ConfigurationMapFeatureFlagProvider: jest.fn(),
  };
});

const loadMock = load as jest.Mock;
const FeatureManagerMock = FeatureManager as unknown as jest.Mock;
const ConfigurationMapFeatureFlagProviderMock = ConfigurationMapFeatureFlagProvider as unknown as jest.Mock;

describe('AzureAppConfigurationProvider', () => {
  const isEnabled = jest.fn();
  const getVariant = jest.fn();
  const getFeatureFlag = jest.fn().mockResolvedValue({ id: 'flag', enabled: true });
  const refresh = jest.fn().mockResolvedValue(undefined);
  const dispose = jest.fn();
  let onRefreshListener: (() => void) | undefined;
  const onRefresh = jest.fn((listener: () => void) => {
    onRefreshListener = listener;
    return { dispose };
  });

  const appConfig = { refresh, onRefresh } as unknown as Awaited<ReturnType<typeof load>>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    onRefreshListener = undefined;
    loadMock.mockResolvedValue(appConfig);
    FeatureManagerMock.mockImplementation(() => ({ isEnabled, getVariant }));
    ConfigurationMapFeatureFlagProviderMock.mockImplementation(() => ({ getFeatureFlag }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const createProvider = async (
    config: AzureAppConfigurationProviderConfig = { connectionString: 'Endpoint=https://example;Id=abc;Secret=xyz' },
  ) => {
    const provider = new AzureAppConfigurationProvider(config);
    await provider.initialize();
    return provider;
  };

  it('should be an instance of AzureAppConfigurationProvider', () => {
    expect(new AzureAppConfigurationProvider({ connectionString: 'cs' })).toBeInstanceOf(AzureAppConfigurationProvider);
  });

  it('exposes server metadata', () => {
    const provider = new AzureAppConfigurationProvider({ connectionString: 'cs' });
    expect(provider.metadata.name).toBe('azure-app-configuration-provider');
    expect(provider.runsOn).toBe('server');
  });

  describe('initialize', () => {
    it('loads feature flags using a connection string', async () => {
      await createProvider({ connectionString: 'my-connection-string' });

      expect(loadMock).toHaveBeenCalledWith('my-connection-string', {
        featureFlagOptions: {
          enabled: true,
          selectors: [{ keyFilter: '*' }],
          refresh: { enabled: true, refreshIntervalInMs: 30_000 },
        },
      });
      expect(ConfigurationMapFeatureFlagProviderMock).toHaveBeenCalledWith(appConfig);
      expect(FeatureManagerMock).toHaveBeenCalled();
    });

    it('loads feature flags using an endpoint and credential', async () => {
      const credential = { getToken: jest.fn() };
      const provider = new AzureAppConfigurationProvider({
        endpoint: 'https://example.azconfig.io',
        credential,
        selectors: [{ keyFilter: 'app*', labelFilter: 'prod' }],
        refreshIntervalInMs: 10_000,
      });
      await provider.initialize();

      expect(loadMock).toHaveBeenCalledWith('https://example.azconfig.io', credential, {
        featureFlagOptions: {
          enabled: true,
          selectors: [{ keyFilter: 'app*', labelFilter: 'prod' }],
          refresh: { enabled: true, refreshIntervalInMs: 10_000 },
        },
      });
    });

    it('does not register a refresh timer or listener when refresh is disabled', async () => {
      await createProvider({ connectionString: 'cs', enableRefresh: false });
      expect(onRefresh).not.toHaveBeenCalled();

      jest.advanceTimersByTime(60_000);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('throws a fatal error when load fails', async () => {
      loadMock.mockRejectedValueOnce(new Error('bad credentials'));
      const provider = new AzureAppConfigurationProvider({ connectionString: 'cs' });
      await expect(provider.initialize()).rejects.toThrow('Failed to initialize Azure App Configuration provider');
    });
  });

  describe('refresh and events', () => {
    it('emits ConfigurationChanged when a refresh reports a change', async () => {
      const provider = await createProvider();
      const handler = jest.fn();
      provider.events.addHandler(ProviderEvents.ConfigurationChanged, handler);

      onRefreshListener?.();

      expect(handler).toHaveBeenCalled();
    });

    it('polls refresh on the configured interval', async () => {
      await createProvider({ connectionString: 'cs', refreshIntervalInMs: 5_000 });

      jest.advanceTimersByTime(12_000);
      expect(refresh).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveBooleanEvaluation', () => {
    it('returns the enabled state from the feature manager with a static reason when no filters apply', async () => {
      const provider = await createProvider();
      isEnabled.mockResolvedValue(true);
      getFeatureFlag.mockResolvedValueOnce({ id: 'Beta', enabled: true });

      const result = await provider.resolveBooleanEvaluation('Beta', false, { targetingKey: 'user-1' });

      expect(isEnabled).toHaveBeenCalledWith('Beta', { userId: 'user-1', groups: undefined });
      expect(result).toEqual({ value: true, reason: StandardResolutionReasons.STATIC });
    });

    it('returns TARGETING_MATCH when a targeting filter is configured', async () => {
      const provider = await createProvider();
      isEnabled.mockResolvedValue(true);
      getFeatureFlag.mockResolvedValueOnce({
        id: 'Beta',
        enabled: true,
        conditions: { client_filters: [{ name: 'Microsoft.Targeting' }] },
      });

      const result = await provider.resolveBooleanEvaluation('Beta', false, { targetingKey: 'user-1' });

      expect(result).toEqual({ value: true, reason: StandardResolutionReasons.TARGETING_MATCH });
    });

    it('returns STATIC when the flag is disabled without evaluating filters', async () => {
      const provider = await createProvider();
      isEnabled.mockResolvedValue(false);
      getFeatureFlag.mockResolvedValueOnce({
        id: 'Beta',
        enabled: false,
        conditions: { client_filters: [{ name: 'Microsoft.Targeting' }] },
      });

      const result = await provider.resolveBooleanEvaluation('Beta', true, { targetingKey: 'user-1' });

      expect(result).toEqual({ value: false, reason: StandardResolutionReasons.STATIC });
    });

    it('maps targetingKey and groups into the targeting context', async () => {
      const provider = await createProvider();
      isEnabled.mockResolvedValue(false);

      await provider.resolveBooleanEvaluation('Beta', true, { targetingKey: 'user-2', groups: ['g1', 'g2'] });

      expect(isEnabled).toHaveBeenCalledWith('Beta', { userId: 'user-2', groups: ['g1', 'g2'] });
    });

    it('throws ProviderNotReadyError when not initialized', async () => {
      const provider = new AzureAppConfigurationProvider({ connectionString: 'cs' });
      await expect(provider.resolveBooleanEvaluation('Beta', false, {})).rejects.toThrow(ProviderNotReadyError);
    });

    it('returns FLAG_NOT_FOUND when the flag is not found', async () => {
      const provider = await createProvider();
      getFeatureFlag.mockResolvedValueOnce(undefined);

      const result = await provider.resolveBooleanEvaluation('MissingFlag', true, {});

      expect(result).toEqual({
        value: true,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: "Flag 'MissingFlag' was not found.",
      });
      expect(isEnabled).not.toHaveBeenCalled();
    });
  });

  describe('variant-based evaluations', () => {
    it('resolves a string variant configuration with DEFAULT when the default variant is assigned', async () => {
      const provider = await createProvider();
      isEnabled.mockResolvedValue(true);
      getFeatureFlag.mockResolvedValueOnce({
        id: 'Greeting',
        enabled: true,
        variants: [{ name: 'Large' }],
        allocation: { default_when_enabled: 'Large' },
      });
      getVariant.mockResolvedValue(variant('Large', 'big'));

      const result = await provider.resolveStringEvaluation('Greeting', 'default', { targetingKey: 'user-1' });

      expect(result).toEqual({ value: 'big', variant: 'Large', reason: StandardResolutionReasons.DEFAULT });
    });

    it('resolves a string variant configuration with TARGETING_MATCH when user allocation matches', async () => {
      const provider = await createProvider();
      isEnabled.mockResolvedValue(true);
      getFeatureFlag.mockResolvedValueOnce({
        id: 'Greeting',
        enabled: true,
        variants: [{ name: 'Large' }],
        allocation: { user: [{ variant: 'Large', users: ['user-1'] }] },
      });
      getVariant.mockResolvedValue(variant('Large', 'big'));

      const result = await provider.resolveStringEvaluation('Greeting', 'default', { targetingKey: 'user-1' });

      expect(result).toEqual({ value: 'big', variant: 'Large', reason: StandardResolutionReasons.TARGETING_MATCH });
    });

    it('resolves a number variant configuration with DEFAULT for the default variant', async () => {
      const provider = await createProvider();
      isEnabled.mockResolvedValue(true);
      getFeatureFlag.mockResolvedValueOnce({
        id: 'Price',
        enabled: true,
        variants: [{ name: 'Discount' }],
        allocation: { default_when_enabled: 'Discount' },
      });
      getVariant.mockResolvedValue(variant('Discount', 42));

      const result = await provider.resolveNumberEvaluation('Price', 0, {});

      expect(result).toEqual({ value: 42, variant: 'Discount', reason: StandardResolutionReasons.DEFAULT });
    });

    it('resolves an object variant configuration with DEFAULT for the default variant', async () => {
      const provider = await createProvider();
      const config = { color: 'red', size: 10 };
      isEnabled.mockResolvedValue(true);
      getFeatureFlag.mockResolvedValueOnce({
        id: 'Theme',
        enabled: true,
        variants: [{ name: 'Theme' }],
        allocation: { default_when_enabled: 'Theme' },
      });
      getVariant.mockResolvedValue(variant('Theme', config));

      const result = await provider.resolveObjectEvaluation('Theme', {}, {});

      expect(result).toEqual({ value: config, variant: 'Theme', reason: StandardResolutionReasons.DEFAULT });
    });

    it('returns the caller default with reason DEFAULT when no variant is assigned', async () => {
      const provider = await createProvider();
      getVariant.mockResolvedValue(undefined);

      const result = await provider.resolveStringEvaluation('Greeting', 'fallback', {});

      expect(result).toEqual({
        value: 'fallback',
        reason: StandardResolutionReasons.DEFAULT,
      });
    });

    it('returns the caller default with reason DEFAULT when the variant has no configuration', async () => {
      const provider = await createProvider();
      getVariant.mockResolvedValue(variant('Empty', undefined));

      const result = await provider.resolveNumberEvaluation('Price', 7, {});

      expect(result).toEqual({
        value: 7,
        reason: StandardResolutionReasons.DEFAULT,
      });
    });

    it('throws TypeMismatchError when the variant type does not match', async () => {
      const provider = await createProvider();
      getVariant.mockResolvedValue(variant('Large', 'not-a-number'));

      await expect(provider.resolveNumberEvaluation('Price', 0, {})).rejects.toThrow(TypeMismatchError);
    });
  });

  describe('onClose', () => {
    it('clears the timer and disposes the refresh listener', async () => {
      const provider = await createProvider();

      await provider.onClose();

      expect(dispose).toHaveBeenCalled();

      refresh.mockClear();
      jest.advanceTimersByTime(60_000);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('is safe to call before initialization', async () => {
      const provider = new AzureAppConfigurationProvider({ connectionString: 'cs' });
      await expect(provider.onClose()).resolves.toBeUndefined();
    });
  });
});
