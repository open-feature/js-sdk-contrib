import type { Logger } from '@openfeature/server-sdk';
import {
  ErrorCode,
  type EvaluationContext,
  FlagNotFoundError,
  GeneralError,
  InvalidContextError,
  type JsonValue,
  type OpenFeatureEventEmitter,
  ParseError,
  ProviderFatalError,
  ProviderNotReadyError,
  type ResolutionDetails,
  ServerProviderEvents,
  StandardResolutionReasons,
  TargetingKeyMissingError,
  TypeMismatchError,
} from '@openfeature/server-sdk';
import type { IEvaluator } from './evaluator';
import type { GoFeatureFlagApi } from '../service/api';
import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import type { EvaluationResponse, Flag, WasmInput } from '../model';
import { EvaluateWasm } from '../wasm/evaluate-wasm';
import { ImpossibleToRetrieveConfigurationException } from '../exception';
import { ErrorMessageMap } from '@openfeature/ofrep-core';

enum ConfigurationState {
  INITIALIZED = 'initialized',
  NOT_INITIALIZED = 'not_initialized',
  ERROR = 'error',
}

/**
 * InProcessEvaluator is an implementation of the IEvaluator interface that evaluates feature flags in-process.
 * It uses the WASM evaluation engine to perform flag evaluations locally.
 */
export class InProcessEvaluator implements IEvaluator {
  private readonly api: GoFeatureFlagApi;
  private readonly options: GoFeatureFlagProviderOptions;
  private readonly evaluationEngine: EvaluateWasm;
  private readonly logger?: Logger;
  private readonly eventChannel?: OpenFeatureEventEmitter; // Event channel for notifications

  // Configuration state
  private etag?: string;
  private lastUpdate: Date = new Date(0);
  private flags: Record<string, Flag> = {};
  private evaluationContextEnrichment: Record<string, JsonValue> = {};
  private periodicRunner?: NodeJS.Timeout;
  private configurationState: ConfigurationState = ConfigurationState.NOT_INITIALIZED;
  /**
   * Constructor of the InProcessEvaluator.
   * @param api - API to contact GO Feature Flag
   * @param options - Options to configure the provider
   * @param eventChannel - Event channel to send events to the event bus or event handler
   * @param logger - Logger instance
   */
  constructor(
    options: GoFeatureFlagProviderOptions,
    api: GoFeatureFlagApi,
    eventChannel: OpenFeatureEventEmitter,
    logger?: Logger,
  ) {
    this.api = api;
    this.options = options;
    this.eventChannel = eventChannel;
    this.logger = logger;
    this.evaluationEngine = new EvaluateWasm(logger);
  }

  /**
   * Initialize the evaluator.
   */
  async initialize(): Promise<void> {
    await this.evaluationEngine.initialize();
    try {
      await this.loadConfiguration(true);
      this.configurationState = ConfigurationState.INITIALIZED;
      // Start periodic configuration polling
      if (this.options.flagChangePollingIntervalMs && this.options.flagChangePollingIntervalMs > 0) {
        this.periodicRunner = setTimeout(() => this.poll(), this.options.flagChangePollingIntervalMs);
      }
    } catch (error) {
      this.logger?.error('Failed to initialize evaluator:', error);
      this.configurationState = ConfigurationState.ERROR;
      throw error;
    }
  }

  /**
   * Poll the configuration from the API.
   */
  private poll(): void {
    this.loadConfiguration(false)
      .catch((error) => this.logger?.error('Failed to load configuration:', error))
      .finally(() => {
        if (this.periodicRunner) {
          // check if polling is still active
          this.periodicRunner = setTimeout(() => this.poll(), this.options.flagChangePollingIntervalMs);
        }
      });
  }

  /**
   * Evaluates a boolean flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  async evaluateBoolean(
    flagKey: string,
    defaultValue: boolean,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    const response = await this.genericEvaluate(flagKey, defaultValue, evaluationContext);
    this.handleError(response, flagKey);

    if (typeof response.value === 'boolean') {
      return this.prepareResponse(response, flagKey, response.value);
    }

    throw new TypeMismatchError(`Flag ${flagKey} had unexpected type, expected boolean.`);
  }

  /**
   * Evaluates a string flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  async evaluateString(
    flagKey: string,
    defaultValue: string,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    const response = await this.genericEvaluate(flagKey, defaultValue, evaluationContext);
    this.handleError(response, flagKey);

    if (typeof response.value === 'string') {
      return this.prepareResponse(response, flagKey, response.value);
    }

    throw new TypeMismatchError(`Flag ${flagKey} had unexpected type, expected string.`);
  }

  /**
   * Evaluates a number flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  async evaluateNumber(
    flagKey: string,
    defaultValue: number,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    const response = await this.genericEvaluate(flagKey, defaultValue, evaluationContext);
    this.handleError(response, flagKey);

    if (typeof response.value === 'number') {
      return this.prepareResponse(response, flagKey, response.value);
    }

    throw new TypeMismatchError(`Flag ${flagKey} had unexpected type, expected number.`);
  }

  /**
   * Evaluates an object flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  async evaluateObject<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    const response = await this.genericEvaluate(flagKey, defaultValue, evaluationContext);
    this.handleError(response, flagKey);

    if (response.value !== null && response.value !== undefined) {
      if (typeof response.value === 'object' || Array.isArray(response.value)) {
        return this.prepareResponse(response, flagKey, response.value as T);
      }
    }
    throw new TypeMismatchError(`Flag ${flagKey} had unexpected type, expected object.`);
  }

  /**
   * Check if the flag is trackable.
   * @param flagKey - The key of the flag to check.
   * @returns True if the flag is trackable.
   */
  isFlagTrackable(flagKey: string): boolean {
    const flag = this.flags[flagKey];
    if (!flag) {
      this.logger?.warn(`Flag with key ${flagKey} not found`);
      // If the flag is not found, this is most likely a configuration change, so we track it by default.
      return true;
    }

    return flag.trackEvents ?? true;
  }

  /**
   * Dispose the evaluator.
   */
  async dispose(): Promise<void> {
    if (this.periodicRunner) {
      clearTimeout(this.periodicRunner);
      this.periodicRunner = undefined;
    }
    return this.evaluationEngine.dispose();
  }

  /**
   * Evaluates a flag with the given key and default value in the context of the provided evaluation context.
   * @param flagKey - Name of the feature flag
   * @param defaultValue - Default value in case of error
   * @param evaluationContext - Context of the evaluation
   * @returns An EvaluationResponse containing the output of the evaluation.
   */
  private async genericEvaluate(
    flagKey: string,
    defaultValue: unknown,
    evaluationContext?: EvaluationContext,
  ): Promise<EvaluationResponse> {
    // If the provider is not initialized, return a default value and an error
    if (this.configurationState !== ConfigurationState.INITIALIZED) {
      return {
        value: defaultValue as JsonValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorDetails: 'Provider is not initialized, impossible to retrieve configuration',
        trackEvents: true,
      };
    }
    const flag = this.flags[flagKey];
    if (!flag) {
      return {
        value: defaultValue as JsonValue,
        errorCode: 'FLAG_NOT_FOUND',
        errorDetails: `Flag with key '${flagKey}' not found`,
        reason: 'ERROR',
        trackEvents: true,
      };
    }

    const input: WasmInput = {
      flagKey,
      evalContext: evaluationContext ? (evaluationContext as Record<string, JsonValue>) : {},
      flagContext: {
        defaultSdkValue: defaultValue,
        evaluationContextEnrichment: this.evaluationContextEnrichment,
      },
      flag,
    };

    return await this.evaluationEngine.evaluate(input);
  }

  /**
   * LoadConfiguration is responsible for loading the configuration of the flags from the API.
   * @throws ImpossibleToRetrieveConfigurationException - In case we are not able to call the relay proxy and to get the flag values.
   */
  private async loadConfiguration(firstLoad = false): Promise<void> {
    try {
      // Call the API to retrieve the flags' configuration and store it in the local copy
      const flagConfigResponse = await this.api.retrieveFlagConfiguration(this.etag, undefined);

      if (!flagConfigResponse) {
        throw new ImpossibleToRetrieveConfigurationException('Flag configuration response is null');
      }

      if (this.etag && this.etag === flagConfigResponse.etag) {
        this.logger?.debug('Flag configuration has not changed');
        return;
      }

      const respLastUpdated = flagConfigResponse.lastUpdated || new Date(0);
      if (
        this.lastUpdate.getTime() !== new Date(0).getTime() &&
        respLastUpdated.getTime() !== new Date(0).getTime() &&
        respLastUpdated < this.lastUpdate
      ) {
        this.logger?.warn('Configuration received is older than the current one');
        return;
      }

      this.logger?.debug('Flag configuration has changed');
      this.etag = flagConfigResponse.etag;
      this.lastUpdate = flagConfigResponse.lastUpdated || new Date(0);
      this.flags = flagConfigResponse.flags || {};
      this.evaluationContextEnrichment = flagConfigResponse.evaluationContextEnrichment || {};

      // Send an event to the event channel to notify about the configuration change
      if (this.eventChannel && !firstLoad) {
        this.logger?.debug('Emitting configuration changed event');
        this.eventChannel.emit(ServerProviderEvents.ConfigurationChanged, {});
      }
    } catch (error) {
      this.logger?.error('Failed to load configuration:', error);
      throw error;
    }
  }

  /**
   * HandleError is handling the error response from the evaluation API.
   * @param response - Response of the evaluation.
   * @param flagKey - Name of the feature flag.
   * @throws Error - When the evaluation is on error.
   */
  private handleError(response: EvaluationResponse, flagKey: string): void {
    switch (response.errorCode) {
      case '':
      case null:
      case undefined:
        // if we no error code it means that the evaluation is successful
        return;
      case ErrorCode.FLAG_NOT_FOUND:
        throw new FlagNotFoundError(response.errorDetails || `Flag ${flagKey} was not found in your configuration`);
      case ErrorCode.PARSE_ERROR:
        throw new ParseError(response.errorDetails || `Parse error for flag ${flagKey}`);
      case ErrorCode.TYPE_MISMATCH:
        throw new TypeMismatchError(response.errorDetails || `Type mismatch for flag ${flagKey}`);
      case ErrorCode.TARGETING_KEY_MISSING:
        throw new TargetingKeyMissingError(response.errorDetails || `Targeting key missing for flag ${flagKey}`);
      case ErrorCode.INVALID_CONTEXT:
        throw new InvalidContextError(response.errorDetails || `Invalid context for flag ${flagKey}`);
      case ErrorCode.PROVIDER_NOT_READY:
        throw new ProviderNotReadyError(response.errorDetails || `Provider not ready for flag ${flagKey}`);
      case ErrorCode.PROVIDER_FATAL:
        throw new ProviderFatalError(response.errorDetails || `Provider fatal error for flag ${flagKey}`);
      default:
        throw new GeneralError(response.errorDetails || `Evaluation error: ${response.errorCode}`);
    }
  }

  /**
   * PrepareResponse is preparing the response to be returned to the caller.
   * @param response - Response of the evaluation.
   * @param flagKey - Name of the feature flag.
   * @param value - Value of the feature flag.
   * @returns ResolutionDetails with the flag value and metadata.
   */
  private prepareResponse<T>(response: EvaluationResponse, flagKey: string, value: T): ResolutionDetails<T> {
    try {
      return {
        value,
        reason: response.reason,
        flagMetadata: response.metadata as Record<string, string | number | boolean>,
        variant: response.variationType,
      };
    } catch (error) {
      throw new TypeMismatchError(`Flag value ${flagKey} had unexpected type ${typeof response.value}.`);
    }
  }
}
