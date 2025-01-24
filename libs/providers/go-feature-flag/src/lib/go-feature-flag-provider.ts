import {
  EvaluationContext,
  Hook,
  JsonValue,
  Logger,
  OpenFeatureEventEmitter,
  Provider,
  ResolutionDetails,
  ServerProviderEvents,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';
import { ConfigurationChange, ExporterMetadataValue, GoFeatureFlagProviderOptions } from './model';
import { GoFeatureFlagDataCollectorHook } from './data-collector-hook';
import { GoffApiController } from './controller/goff-api';
import { CacheController } from './controller/cache';
import { ConfigurationChangeEndpointNotFound } from './errors/configuration-change-endpoint-not-found';

// GoFeatureFlagProvider is the official Open-feature provider for GO Feature Flag.
export class GoFeatureFlagProvider implements Provider {
  metadata = {
    name: GoFeatureFlagProvider.name,
  };
  readonly runsOn = 'server';
  events = new OpenFeatureEventEmitter();
  hooks?: Hook[];
  private DEFAULT_POLL_INTERVAL = 30000;
  // disableDataCollection set to true if you don't want to collect the usage of flags retrieved in the cache.
  private readonly _disableDataCollection: boolean;
  // dataCollectorHook is the hook used to send the data to the GO Feature Flag data collector API.
  private readonly _dataCollectorHook?: GoFeatureFlagDataCollectorHook;
  // goffApiController is the controller used to communicate with the GO Feature Flag relay-proxy API.
  private readonly _goffApiController: GoffApiController;
  // cacheController is the controller used to cache the evaluation of the flags.
  private readonly _cacheController?: CacheController;
  private _pollingIntervalId?: number;
  private _pollingInterval: number;
  private _exporterMetadata?: Record<string, ExporterMetadataValue>;

  constructor(options: GoFeatureFlagProviderOptions, logger?: Logger) {
    this._goffApiController = new GoffApiController(options);
    this._dataCollectorHook = new GoFeatureFlagDataCollectorHook(
      {
        dataFlushInterval: options.dataFlushInterval,
        collectUnCachedEvaluation: false,
        exporterMetadata: options.exporterMetadata,
      },
      this._goffApiController,
      logger,
    );
    this._exporterMetadata = options.exporterMetadata;
    this._disableDataCollection = options.disableDataCollection || false;
    this._cacheController = new CacheController(options, logger);
    this._pollingInterval = options.pollInterval ?? this.DEFAULT_POLL_INTERVAL;
  }

  /**
   * initialize is called everytime the provider is instanced inside GO Feature Flag.
   * It will start the background process for data collection to be able to run every X ms.
   */
  async initialize() {
    if (!this._disableDataCollection && this._dataCollectorHook) {
      this.hooks = [this._dataCollectorHook];
      this._dataCollectorHook.init();
    }

    if (this._pollingInterval > 0) {
      this.startPolling();
    }
  }

  /**
   * onClose is called everytime OpenFeature.Close() function is called.
   * It will gracefully terminate the provider and ensure that all the data are sent to the relay-proxy.
   */
  async onClose() {
    this.stopPolling();
    this._cacheController?.clear();
    await this._dataCollectorHook?.close();
  }

  /**
   * resolveBooleanEvaluation is calling the GO Feature Flag relay-proxy API and return a boolean value.
   * @param flagKey - name of your feature flag key.
   * @param defaultValue - default value is used if we are not able to evaluate the flag for this user.
   * @param context - the context used for flag evaluation.
   * @return {Promise<ResolutionDetails<boolean>>} An object containing the result of the flag evaluation by GO Feature Flag.
   * @throws {ProxyNotReady} When we are not able to communicate with the relay-proxy
   * @throws {ProxyTimeout} When the HTTP call is timing out
   * @throws {UnknownError} When an unknown error occurs
   * @throws {TypeMismatchError} When the type of the variation is not the one expected
   * @throws {FlagNotFoundError} When the flag does not exist
   */
  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.resolveEvaluationGoFeatureFlagProxy<boolean>(flagKey, defaultValue, context, 'boolean');
  }

  /**
   * resolveStringEvaluation is calling the GO Feature Flag relay-proxy API and return a string value.
   * @param flagKey - name of your feature flag key.
   * @param defaultValue - default value is used if we are not able to evaluate the flag for this user.
   * @param context - the context used for flag evaluation.
   * @return {Promise<ResolutionDetails<string>>} An object containing the result of the flag evaluation by GO Feature Flag.
   * @throws {ProxyNotReady} When we are not able to communicate with the relay-proxy
   * @throws {ProxyTimeout} When the HTTP call is timing out
   * @throws {UnknownError} When an unknown error occurs
   * @throws {TypeMismatchError} When the type of the variation is not the one expected
   * @throws {FlagNotFoundError} When the flag does not exist
   */
  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.resolveEvaluationGoFeatureFlagProxy<string>(flagKey, defaultValue, context, 'string');
  }

  /**
   * resolveNumberEvaluation is calling the GO Feature Flag relay-proxy API and return a number value.
   * @param flagKey - name of your feature flag key.
   * @param defaultValue - default value is used if we are not able to evaluate the flag for this user.
   * @param context - the context used for flag evaluation.
   * @return {Promise<ResolutionDetails<number>>} An object containing the result of the flag evaluation by GO Feature Flag.
   * @throws {ProxyNotReady} When we are not able to communicate with the relay-proxy
   * @throws {ProxyTimeout} When the HTTP call is timing out
   * @throws {UnknownError} When an unknown error occurs
   * @throws {TypeMismatchError} When the type of the variation is not the one expected
   * @throws {FlagNotFoundError} When the flag does not exist
   */
  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.resolveEvaluationGoFeatureFlagProxy<number>(flagKey, defaultValue, context, 'number');
  }

  /**
   * resolveObjectEvaluation is calling the GO Feature Flag relay-proxy API and return an object.
   * @param flagKey - name of your feature flag key.
   * @param defaultValue - default value is used if we are not able to evaluate the flag for this user.
   * @param context - the context used for flag evaluation.
   * @return {Promise<ResolutionDetails<U extends JsonValue>>} An object containing the result of the flag evaluation by GO Feature Flag.
   * @throws {ProxyNotReady} When we are not able to communicate with the relay-proxy
   * @throws {ProxyTimeout} When the HTTP call is timing out
   * @throws {UnknownError} When an unknown error occurs
   * @throws {TypeMismatchError} When the type of the variation is not the one expected
   * @throws {FlagNotFoundError} When the flag does not exist
   */
  async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    return this.resolveEvaluationGoFeatureFlagProxy<U>(flagKey, defaultValue, context, 'object');
  }

  /**
   * resolveEvaluationGoFeatureFlagProxy is a generic function the call the GO Feature Flag relay-proxy API
   * to evaluate the flag.
   * This is the same call for all types of flags so this function also checks if the return call is the one expected.
   * @param flagKey - name of your feature flag key.
   * @param defaultValue - default value is used if we are not able to evaluate the flag for this user.
   * @param evaluationContext - the evaluationContext against who we will evaluate the flag.
   * @param expectedType - the type we expect the result to be
   * @return {Promise<ResolutionDetails<T>>} An object containing the result of the flag evaluation by GO Feature Flag.
   * @throws {ProxyNotReady} When we are not able to communicate with the relay-proxy
   * @throws {ProxyTimeout} When the HTTP call is timing out
   * @throws {UnknownError} When an unknown error occurs
   * @throws {TypeMismatchError} When the type of the variation is not the one expected
   * @throws {FlagNotFoundError} When the flag does not exist
   */
  async resolveEvaluationGoFeatureFlagProxy<T>(
    flagKey: string,
    defaultValue: T,
    evaluationContext: EvaluationContext,
    expectedType: string,
  ): Promise<ResolutionDetails<T>> {
    const cacheValue = this._cacheController?.get(flagKey, evaluationContext);
    if (cacheValue) {
      cacheValue.reason = StandardResolutionReasons.CACHED;
      return cacheValue;
    }

    const evaluationResponse = await this._goffApiController.evaluate(
      flagKey,
      defaultValue,
      evaluationContext,
      expectedType,
      this._exporterMetadata ?? {},
    );

    this._cacheController?.set(flagKey, evaluationContext, evaluationResponse);
    return evaluationResponse.resolutionDetails;
  }

  private startPolling() {
    this._pollingIntervalId = setInterval(async () => {
      try {
        const res = await this._goffApiController.configurationHasChanged();
        if (res === ConfigurationChange.FLAG_CONFIGURATION_UPDATED) {
          this.events?.emit(ServerProviderEvents.ConfigurationChanged, { message: 'Flags updated' });
          this._cacheController?.clear();
        }
      } catch (error) {
        if (error instanceof ConfigurationChangeEndpointNotFound && this._pollingIntervalId) {
          this.stopPolling();
        }
      }
    }, this._pollingInterval) as unknown as number;
  }

  /**
   * Stop polling for flag updates
   * @private
   */
  private stopPolling() {
    if (this._pollingIntervalId) {
      clearInterval(this._pollingIntervalId);
    }
  }
}
