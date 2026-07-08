import type { EvaluationContext, JsonValue, Paradigm, Provider, ResolutionDetails } from '@openfeature/server-sdk';
import {
  ErrorCode,
  OpenFeatureEventEmitter,
  ProviderEvents,
  ProviderFatalError,
  ProviderNotReadyError,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/server-sdk';
import type { AzureAppConfiguration, Disposable, FeatureFlagOptions } from '@azure/app-configuration-provider';
import { KeyFilter, load } from '@azure/app-configuration-provider';
import { ConfigurationMapFeatureFlagProvider, FeatureManager } from '@microsoft/feature-management';
import type { AzureAppConfigurationProviderConfig } from './types';
import { transformContext } from './context-transformer';
import { resolveBooleanResolutionReason, resolveVariantResolutionReason } from './resolution-reason';

const DEFAULT_REFRESH_INTERVAL_MS = 30_000;

export class AzureAppConfigurationProvider implements Provider {
  public readonly runsOn: Paradigm = 'server';

  public readonly events = new OpenFeatureEventEmitter();

  public readonly metadata = {
    name: 'azure-app-configuration-provider',
  } as const;

  public readonly hooks = [];

  private readonly _config: AzureAppConfigurationProviderConfig;
  private _appConfig?: AzureAppConfiguration;
  private _featureFlagProvider?: ConfigurationMapFeatureFlagProvider;
  private _featureManager?: FeatureManager;
  private _refreshDisposable?: Disposable;
  private _refreshTimer?: ReturnType<typeof setInterval>;

  constructor(config: AzureAppConfigurationProviderConfig) {
    this._config = config;
  }

  public async initialize(): Promise<void> {
    const enableRefresh = this._config.enableRefresh ?? true;
    const refreshIntervalInMs = this._config.refreshIntervalInMs ?? DEFAULT_REFRESH_INTERVAL_MS;
    const selectors = this._config.selectors ?? [{ keyFilter: KeyFilter.Any }];

    const featureFlagOptions: FeatureFlagOptions = {
      enabled: true,
      selectors,
      refresh: {
        enabled: enableRefresh,
        refreshIntervalInMs,
      },
    };

    try {
      if ('connectionString' in this._config) {
        this._appConfig = await load(this._config.connectionString, { featureFlagOptions });
      } else {
        this._appConfig = await load(this._config.endpoint, this._config.credential, { featureFlagOptions });
      }
    } catch (err) {
      throw new ProviderFatalError(
        `Failed to initialize Azure App Configuration provider: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this._featureFlagProvider = new ConfigurationMapFeatureFlagProvider(this._appConfig);
    this._featureManager = new FeatureManager(this._featureFlagProvider);

    if (enableRefresh) {
      this._refreshDisposable = this._appConfig.onRefresh(() => {
        this.events.emit(ProviderEvents.ConfigurationChanged);
      });

      this._refreshTimer = setInterval(() => {
        // Refresh is a no-op until the configured interval elapses, and any error is
        // swallowed so that transient failures don't crash the host application; the
        // provider keeps serving the last known good configuration.
        void this._appConfig?.refresh().catch(() => undefined);
      }, refreshIntervalInMs);

      // Don't keep the event loop alive because of the refresh timer.
      this._refreshTimer.unref?.();
    }
  }

  public async onClose(): Promise<void> {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = undefined;
    }

    this._refreshDisposable?.dispose();
    this._refreshDisposable = undefined;
    this._featureManager = undefined;
    this._featureFlagProvider = undefined;
    this._appConfig = undefined;
  }

  public async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    const featureManager = this.getFeatureManager();
    const targetingContext = transformContext(context);

    const featureFlag = await this._featureFlagProvider?.getFeatureFlag(flagKey);
    if (!featureFlag) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: `Flag '${flagKey}' was not found.`,
      };
    }

    const value = await featureManager.isEnabled(flagKey, targetingContext);

    return {
      value,
      reason: resolveBooleanResolutionReason(featureFlag),
    };
  }

  public async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.resolveVariant(flagKey, 'string', defaultValue, context);
  }

  public async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.resolveVariant(flagKey, 'number', defaultValue, context);
  }

  public async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    return this.resolveVariant(flagKey, 'object', defaultValue, context);
  }

  private async resolveVariant<T extends JsonValue>(
    flagKey: string,
    type: 'string' | 'number' | 'object',
    defaultValue: T,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    const featureManager = this.getFeatureManager();
    const targetingContext = transformContext(context);

    const featureFlag = await this._featureFlagProvider?.getFeatureFlag(flagKey);
    if (!featureFlag) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: `Flag '${flagKey}' was not found.`,
      };
    }

    const enabled = await featureManager.isEnabled(flagKey, targetingContext);
    const variant = await featureManager.getVariant(flagKey, targetingContext);

    if (!variant || variant.configuration === undefined || variant.configuration === null) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: `Flag '${flagKey}' was not found.`,
      };
    }

    const value = variant.configuration;

    if (type === 'string' && typeof value !== 'string') {
      throw new TypeMismatchError(`Variant configuration for flag "${flagKey}" is not a string`);
    }

    if (type === 'number' && typeof value !== 'number') {
      throw new TypeMismatchError(`Variant configuration for flag "${flagKey}" is not a number`);
    }

    if (type === 'object' && (typeof value !== 'object' || value === null)) {
      throw new TypeMismatchError(`Variant configuration for flag "${flagKey}" is not an object`);
    }

    return {
      value: value as T,
      variant: variant.name,
      reason: await resolveVariantResolutionReason(featureFlag, targetingContext, enabled),
    };
  }

  private getFeatureManager(): FeatureManager {
    if (!this._featureManager) {
      throw new ProviderNotReadyError('Azure App Configuration provider is not initialized');
    }

    return this._featureManager;
  }
}
