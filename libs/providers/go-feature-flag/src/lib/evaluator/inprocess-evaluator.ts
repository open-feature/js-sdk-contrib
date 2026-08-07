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
import { NOT_MODIFIED } from '../model';
import { EvaluateWasm } from '../wasm/evaluate-wasm';
import { ImpossibleToRetrieveConfigurationException } from '../exception';
import {
  DEFAULT_POLLING_INTERVAL_MS,
  EVALUATED_REMOTELY_KEY,
  FALLBACK_ENGINE_ERROR_CODES,
  STALE_AFTER_CONSECUTIVE_FAILURES,
} from '../helper/constants';
import { RemoteEvaluator } from './remote-evaluator';
import { diffFlagSerializations, serializeFlags, toFlagLookup } from '../helper/flag-serialization';

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
  private readonly evaluationEngine: EvaluateWasm;
  private readonly logger?: Logger;
  private readonly eventChannel?: OpenFeatureEventEmitter; // Event channel for notifications
  /**
   * Interval between configuration refreshes, in milliseconds. Resolved once so that the initial
   * schedule and every reschedule use the same value: passing the raw option straight to setTimeout
   * would mean an unset option becomes a zero delay, i.e. a tight polling loop.
   */
  private readonly pollingIntervalMs: number;
  /**
   * Flag keys to request, or undefined for the whole configuration. An empty list is normalised to
   * undefined, because the relay proxy reads an empty `flags` array as "send everything" — so
   * storing it as-is would make an explicitly empty option indistinguishable from an unset one only
   * by accident rather than by intent.
   */
  private readonly evaluationFlagList?: string[];
  /**
   * Kept solely to build the fallback evaluator. Holding the options again is deliberate: §16
   * requires the fallback to authenticate and time out exactly as a normal remote evaluation does,
   * and reusing the same options object is what makes that true by construction rather than by
   * two code paths agreeing.
   */
  private readonly options: GoFeatureFlagProviderOptions;
  /** Built on the first fallback, so a deployment that never hits one pays nothing for it. */
  private fallbackEvaluator?: RemoteEvaluator;

  // Configuration state
  private etag?: string;
  private lastUpdate: Date = new Date(0);
  /** Null-prototype so that a flag key can never resolve to an inherited Object.prototype member. */
  private flags: Record<string, Flag> = toFlagLookup({});
  private evaluationContextEnrichment: Record<string, JsonValue> = {};
  private periodicRunner?: ReturnType<typeof setTimeout>;
  /** Refresh currently in flight, so that shutdown and re-initialization can join it. */
  private pollInFlight?: Promise<void>;
  /** Consecutive failed refreshes, reset by the next successful one. */
  private consecutiveRefreshFailures = 0;
  /** Whether the provider has already reported itself stale, so it is reported only once. */
  private stale = false;
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
    this.eventChannel = eventChannel;
    this.logger = logger;
    this.evaluationEngine = new EvaluateWasm(logger, options.wasmBinaryPath);
    this.pollingIntervalMs =
      options.flagChangePollingIntervalMs && options.flagChangePollingIntervalMs > 0
        ? options.flagChangePollingIntervalMs
        : DEFAULT_POLLING_INTERVAL_MS;
    this.evaluationFlagList = options.evaluationFlagList?.length ? options.evaluationFlagList : undefined;
    this.options = options;
  }

  /**
   * Initialize the evaluator.
   */
  async initialize(): Promise<void> {
    // Initialization may be called more than once. Cancel any polling task left over from a
    // previous call and wait for a refresh already in flight to settle, so that its reschedule
    // cannot attach a second chain to the timer we are about to install below.
    await this.stopPolling();
    await this.evaluationEngine.initialize();
    try {
      await this.loadConfiguration(true);
      this.configurationState = ConfigurationState.INITIALIZED;
      // A fresh configuration clears any staleness carried over from a previous initialization.
      this.consecutiveRefreshFailures = 0;
      this.stale = false;
      // Polling is always on: a provider that only ever reads the configuration once serves its
      // start-up snapshot for the lifetime of the process, and never learns about a flag change.
      this.periodicRunner = setTimeout(() => this.poll(), this.pollingIntervalMs);
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
    this.pollInFlight = this.loadConfiguration(false)
      .then(
        () => this.onRefreshSucceeded(),
        (error) => {
          this.logger?.error('Failed to load configuration:', error);
          this.onRefreshFailed();
        },
      )
      .finally(() => {
        if (this.periodicRunner) {
          // check if polling is still active
          this.periodicRunner = setTimeout(() => this.poll(), this.pollingIntervalMs);
        }
      });
  }

  /**
   * Records a successful refresh, returning the provider to ready if it had gone stale.
   */
  private onRefreshSucceeded(): void {
    this.consecutiveRefreshFailures = 0;
    if (!this.stale) {
      return;
    }
    this.stale = false;
    this.logger?.info('Flag configuration refresh recovered, provider is ready again');
    this.eventChannel?.emit(ServerProviderEvents.Ready, {});
  }

  /**
   * Records a failed refresh, reporting the provider stale once enough have failed in a row.
   *
   * The last known-good configuration keeps being served throughout: a failed refresh rejects
   * before writing anything, so going stale reports that the configuration is ageing rather than
   * that evaluation has stopped working.
   */
  private onRefreshFailed(): void {
    this.consecutiveRefreshFailures++;
    if (this.stale || this.consecutiveRefreshFailures < STALE_AFTER_CONSECUTIVE_FAILURES) {
      return;
    }
    this.stale = true;
    this.logger?.warn(
      `Flag configuration could not be refreshed ${this.consecutiveRefreshFailures} times in a row, ` +
        'the configuration being served may be out of date',
    );
    this.eventChannel?.emit(ServerProviderEvents.Stale, {});
  }

  /**
   * Cancels the polling task and waits for a refresh already in flight to settle.
   *
   * Clearing the timer alone is not enough: a refresh that is mid-flight reschedules itself when it
   * settles, and it decides whether to do so by looking at periodicRunner. Waiting for it here,
   * while periodicRunner is still undefined, is what stops it attaching to a later timer.
   */
  private async stopPolling(): Promise<void> {
    if (this.periodicRunner) {
      clearTimeout(this.periodicRunner);
      this.periodicRunner = undefined;
    }
    await this.pollInFlight;
    this.pollInFlight = undefined;
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

    const remote = await this.fallbackToRemote(response, flagKey, (evaluator) =>
      evaluator.evaluateBoolean(flagKey, defaultValue, evaluationContext),
    );
    if (remote) {
      return remote;
    }

    this.handleError(response, flagKey);

    // A null result is the engine reporting "no value", not a type error. The caller's default is
    // returned while the engine's reason, variant and metadata are preserved, since those are what
    // explain why there is no value.
    if (this.hasNoValue(response)) {
      return this.prepareResponse(response, flagKey, defaultValue);
    }

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

    const remote = await this.fallbackToRemote(response, flagKey, (evaluator) =>
      evaluator.evaluateString(flagKey, defaultValue, evaluationContext),
    );
    if (remote) {
      return remote;
    }

    this.handleError(response, flagKey);

    // A null result is the engine reporting "no value", not a type error. The caller's default is
    // returned while the engine's reason, variant and metadata are preserved, since those are what
    // explain why there is no value.
    if (this.hasNoValue(response)) {
      return this.prepareResponse(response, flagKey, defaultValue);
    }

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

    const remote = await this.fallbackToRemote(response, flagKey, (evaluator) =>
      evaluator.evaluateNumber(flagKey, defaultValue, evaluationContext),
    );
    if (remote) {
      return remote;
    }

    this.handleError(response, flagKey);

    // A null result is the engine reporting "no value", not a type error. The caller's default is
    // returned while the engine's reason, variant and metadata are preserved, since those are what
    // explain why there is no value.
    if (this.hasNoValue(response)) {
      return this.prepareResponse(response, flagKey, defaultValue);
    }

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

    const remote = await this.fallbackToRemote(response, flagKey, (evaluator) =>
      evaluator.evaluateObject<T>(flagKey, defaultValue, evaluationContext),
    );
    if (remote) {
      return remote;
    }

    this.handleError(response, flagKey);

    // A null result is the engine reporting "no value", not a type error. The caller's default is
    // returned while the engine's reason, variant and metadata are preserved, since those are what
    // explain why there is no value.
    if (this.hasNoValue(response)) {
      return this.prepareResponse(response, flagKey, defaultValue);
    }

    if (typeof response.value === 'object' || Array.isArray(response.value)) {
      return this.prepareResponse(response, flagKey, response.value as T);
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
    await this.stopPolling();
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
    // No configuration has been loaded yet, so we cannot answer for any flag. This check precedes
    // the flag lookup below deliberately: reporting FLAG_NOT_FOUND here would blame the caller's
    // flag key for what is an infrastructure failure.
    if (this.configurationState !== ConfigurationState.INITIALIZED) {
      return {
        value: defaultValue as JsonValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.PROVIDER_NOT_READY,
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
      const flagConfigResponse = await this.api.retrieveFlagConfiguration(this.etag, this.evaluationFlagList);

      // Nothing changed: return before touching any configuration state. The stored flags,
      // enrichment, timestamp and ETag must all survive a 304 untouched.
      if (flagConfigResponse === NOT_MODIFIED) {
        this.logger?.debug('Flag configuration has not changed');
        return;
      }

      if (!flagConfigResponse) {
        throw new ImpossibleToRetrieveConfigurationException('Flag configuration response is null');
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

      // Which flags changed is decided on content, not on the ETag. A relay proxy or an
      // intermediary that omits ETag would otherwise make every single poll look like a change.
      const previousFlagSerializations = serializeFlags(this.flags);
      const nextFlagSerializations = serializeFlags(flagConfigResponse.flags);
      const previousEnrichmentSerialization = JSON.stringify(this.evaluationContextEnrichment);
      const nextEnrichmentSerialization = JSON.stringify(flagConfigResponse.evaluationContextEnrichment ?? {});

      // The enrichment is merged into the context of every evaluation, so a change to it can change
      // the result of any flag. There is no way to narrow that down, so every flag is reported.
      const flagsChanged =
        nextEnrichmentSerialization !== previousEnrichmentSerialization
          ? [...new Set([...Object.keys(previousFlagSerializations), ...Object.keys(nextFlagSerializations)])]
          : diffFlagSerializations(previousFlagSerializations, nextFlagSerializations);

      this.etag = flagConfigResponse.etag;
      this.lastUpdate = respLastUpdated;
      this.flags = toFlagLookup(flagConfigResponse.flags);
      this.evaluationContextEnrichment = flagConfigResponse.evaluationContextEnrichment || {};

      if (flagsChanged.length === 0) {
        this.logger?.debug('Flag configuration has not changed');
        return;
      }

      this.logger?.debug(`Flag configuration has changed for: ${flagsChanged.join(', ')}`);
      // The initial load is not a change: consumers must not observe a configuration-changed event
      // before the provider is ready.
      if (this.eventChannel && !firstLoad) {
        this.logger?.debug('Emitting configuration changed event');
        this.eventChannel.emit(ServerProviderEvents.ConfigurationChanged, { flagsChanged });
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
  /**
   * Hands a failed local evaluation to the relay proxy, which is authoritative.
   *
   * The trigger is read from the **raw** engine code, before {@link handleError} maps it onto the
   * SDK's enumeration - that mapping is lossy, and `FLAG_CONFIG` in particular would become
   * indistinguishable from the codes that do qualify.
   *
   * Attempted on every qualifying occurrence, with no circuit breaker. That is the specification's
   * choice and it has a cost worth knowing: a persistently malformed flag turns every evaluation of
   * it into a network round trip. The warning log and the metadata stamp exist so that this is
   * diagnosable rather than invisible.
   * @param response - the raw engine response
   * @param flagKey - the flag being evaluated
   * @param evaluateRemotely - performs the typed remote call
   * @returns the remote result, or undefined to let the original in-process error stand
   */
  private async fallbackToRemote<T>(
    response: EvaluationResponse,
    flagKey: string,
    evaluateRemotely: (evaluator: RemoteEvaluator) => Promise<ResolutionDetails<T>>,
  ): Promise<ResolutionDetails<T> | undefined> {
    if (!response.errorCode || !FALLBACK_ENGINE_ERROR_CODES.includes(response.errorCode)) {
      return undefined;
    }

    this.logger?.warn(
      `In-process evaluation of flag '${flagKey}' failed with ${response.errorCode}; falling back to remote evaluation: ${response.errorDetails}`,
    );

    // A WASM trap has already discarded the instance by the time we get here, so the rebuild
    // happens on the next evaluation. Nothing is retried locally in between, as §16 requires.
    this.fallbackEvaluator ??= new RemoteEvaluator(this.options, this.logger);

    try {
      const remote = await evaluateRemotely(this.fallbackEvaluator);
      return {
        ...remote,
        flagMetadata: { ...remote.flagMetadata, [EVALUATED_REMOTELY_KEY]: true },
      };
    } catch (error) {
      // The in-process failure is the root cause, so it is what the caller sees. Returning
      // undefined lets the original response continue to `handleError` unchanged.
      this.logger?.error(`Remote fallback for flag '${flagKey}' also failed`, error);
      return undefined;
    }
  }

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
   * Reports whether the engine returned no value for a flag.
   *
   * This is only reached for an evaluation the engine considered successful, since handleError has
   * already thrown for anything carrying an error code. A flag whose resolved variation is JSON
   * null therefore lands here, and is a value-less result rather than a type mismatch.
   * @param response - Response of the evaluation.
   * @returns True when the engine produced no value.
   */
  private hasNoValue(response: EvaluationResponse): boolean {
    return response.value === null || response.value === undefined;
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
