import type {
  EvaluationContext,
  EventContext,
  FlagValue,
  Hook,
  Logger,
  Paradigm,
  Provider,
  ProviderEmittableEvents,
  ResolutionDetails,
  TrackingEventDetails,
} from '@openfeature/web-sdk';
import {
  FlagNotFoundError,
  OpenFeatureEventEmitter,
  ProviderEvents,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/web-sdk';
import type {
  FlagState,
  GoFeatureFlagAllFlagRequest,
  GOFeatureFlagAllFlagsResponse,
  GoFeatureFlagWebProviderConnectionMode,
  GoFeatureFlagWebProviderOptions,
  TrackingEvent,
} from './model';
import { transformContext } from './context-transformer';
import { FetchAbortedError, FetchError, FetchTimeoutError } from './errors/fetch-error';
import { GoFeatureFlagDataCollectorHook } from './data-collector-hook';
import { CollectorManager } from './collector-manager';
import {
  type FlagChangeEvent,
  type FlagChangeStrategy,
  ServerSentEventFlagChangeStrategy,
  WebSocketFlagChangeStrategy,
} from './change-strategy';
import { buildOptionsFromProviderOptions } from './change-strategy/utils';
import { awaitableTimeout, DeferredPromise, whenAnySettle } from './utils';

type GoFeatureFlagResolvedFlags = {
  flags: {
    [key: string]: ResolutionDetails<FlagValue>;
  };
};

interface FetchErrorHandlerResponse {
  aborted?: boolean;
  reason?: string;
  error?: unknown;
  retriable?: boolean;
}

export class GoFeatureFlagWebProvider implements Provider {
  readonly runsOn: Paradigm = 'client';

  metadata = {
    name: GoFeatureFlagWebProvider.name,
  };
  events = new OpenFeatureEventEmitter();
  // hooks is the list of hooks that are used by the provider
  hooks?: Hook[];

  private readonly _fetchAllPath = 'v1/allflags';

  private readonly _connectionMode: GoFeatureFlagWebProviderConnectionMode;
  // logger is the Open Feature logger to use
  private _logger?: Logger;
  // endpoint of your go-feature-flag relay proxy instance
  private readonly _endpoint: string;
  // timeout in millisecond before we consider the http request as a failure
  private readonly _apiTimeout: number;
  // apiKey is the key used to identify your request in GO Feature Flag
  private _apiKey: string | undefined;
  // customHeaders to be sent for every HTTP request.
  private readonly _customHeaders: Record<string, string> | undefined;
  // initial delay in millisecond to wait before retrying to connect
  private readonly _retryInitialDelay;
  // multiplier of _retryInitialDelay after each failure
  private readonly _retryDelayMultiplier;
  // maximum number of retries
  private readonly _maxRetries;
  // _flags is the in memory representation of all the flags.
  private _flags: GoFeatureFlagResolvedFlags = { flags: {} };
  private readonly _changeStrategy: FlagChangeStrategy;

  private readonly _collectorManager: CollectorManager;
  private readonly _dataCollectorHook: GoFeatureFlagDataCollectorHook;
  // disableDataCollection set to true if you don't want to collect the usage of flags retrieved in the cache.
  private readonly _disableDataCollection: boolean;

  // Fetch Abort Controller is used to cancel inflight requests.
  private _fetchAbortController = new AbortController();
  private _fetchAllUrl!: URL;

  // The context to be used for fetchAll() when there are change updates
  private _lastEvaluationContext?: EvaluationContext;
  // This will force the provider to fetch all the flags, regardless of partial flag updates from `onFlagChange()` handler
  private _lastFetchAllTimestamp = 0;
  private _lastFlagChangeEvent?: FlagChangeEvent;
  private _lastEmittedProviderEvent?: ProviderEvents;

  // Used to check disposal (i.e. when onClose() has been called)
  private _disposing = false;

  constructor(options: GoFeatureFlagWebProviderOptions, logger?: Logger) {
    this._logger = logger;
    this._connectionMode = options?.mode || 'ws'; // default is 'ws' for backward compatibility
    this._apiTimeout = options.apiTimeout || 0; // default is 0 = no timeout
    this._endpoint = options.endpoint;
    this._retryInitialDelay = options.retryInitialDelay || 100;
    this._retryDelayMultiplier = options.retryDelayMultiplier || 2;
    this._maxRetries = options.maxRetries || 10;
    this._apiKey = options.apiKey;
    this._customHeaders = options.customHeaders;
    this._disableDataCollection = options.disableDataCollection || false;

    this._collectorManager = new CollectorManager(options, logger);
    this._dataCollectorHook = new GoFeatureFlagDataCollectorHook(this._collectorManager);
    this._changeStrategy = this.getChangeStrategy(options);
    this.buildFetchAllUrl();
  }

  private buildFetchAllUrl() {
    this._fetchAllUrl = new URL(this._endpoint);
    this._fetchAllUrl.pathname = this._fetchAllUrl.pathname.endsWith('/')
      ? this._fetchAllUrl.pathname + this._fetchAllPath
      : this._fetchAllUrl.pathname + '/' + this._fetchAllPath;
  }

  get changeStrategy() {
    return this._changeStrategy;
  }

  private getChangeStrategy(options: GoFeatureFlagWebProviderOptions): FlagChangeStrategy {
    const commonOptions = buildOptionsFromProviderOptions(options);
    switch (this._connectionMode) {
      case 'ws':
        return new WebSocketFlagChangeStrategy(commonOptions, this._logger);
      case 'sse':
        return new ServerSentEventFlagChangeStrategy(commonOptions, this._logger);
      default:
        throw Error(`Invalid or unsupported connection mode: ${this._connectionMode}`);
    }
  }

  private cancelCurrentRequest() {
    this._fetchAbortController.abort();
    this._fetchAbortController = new AbortController();
  }

  async initialize(context: EvaluationContext): Promise<void> {
    if (!this._disableDataCollection && this._dataCollectorHook) {
      this.hooks = [this._dataCollectorHook];
      this._collectorManager.init();
    }

    this._lastEvaluationContext = { ...context };

    const onFlagChangeHandlerRef = this._changeStrategy.onFlagChange((changeEvent) => {
      // if the provider is disposing, do nothing
      if (this._disposing) return;
      this._logger?.info(`${this._changeStrategy.name}: flags have been changed on the source.`, changeEvent);
      const previousChangeEvent = this._lastFlagChangeEvent;
      this._lastFlagChangeEvent = changeEvent;
      // If: there was a previous not processed change event
      // Then: fetch all flags (because it may be in dirty state)
      // Else: fetch only changed flags
      this.updateInternalState(this._lastEvaluationContext!, previousChangeEvent ? undefined : changeEvent);
    });

    const onStatusChangeHandlerRef = this._changeStrategy.onStatusChange((status) => {
      // if the provider is disposing, do nothing
      if (this._disposing) return;
      this._logger?.info(`${this._changeStrategy.name}: changed status to '${status}'`);
      switch (status) {
        case 'connected':
          // Let's check if we need to re-fetch flags because not Ready
          if (this._lastEmittedProviderEvent !== ProviderEvents.Ready) {
            // we try to update the internal state
            this.updateInternalState(this._lastEvaluationContext!);
          }
          break;
        case 'error':
          // we will set the provider state to STALE
          this.emitProviderEvent(ProviderEvents.Stale, {
            message: `${this._changeStrategy.name}: error while connecting to the source, cached flags may be outdated`,
          });
          break;
        case 'closed':
          // We clean-up some handlers
          onFlagChangeHandlerRef.detach();
          onStatusChangeHandlerRef.detach();
      }
    });

    // make an initial fetch to have cached values.
    if (!this.handleFetchAllResult(await this.fetchAll(context).catch((err) => this.handleFetchErrors(err)))) {
      // initial fetch failed, retry without blocking initialize().
      this._logger?.warn('Initial fetch failed');
      this.fetchAllWithRetries(context)
        .catch((err) => this.handleFetchErrors(err))
        .then((res) => this.handleFetchAllResult(res));
    }
    // We connect with the change strategy now
    this._changeStrategy.connect();
  }

  async onClose(): Promise<void> {
    if (!this._disposing) {
      this._disposing = true;
      if (!this._disableDataCollection) {
        await this._collectorManager?.close();
      }
      this._changeStrategy?.close();
      this._lastEvaluationContext = undefined;
    }
  }

  async onContextChange(_: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    this._logger?.debug(`${GoFeatureFlagWebProvider.name}: new context provided: ${newContext}`);
    // NOTE: the following line has been commented because the OpenFeature SDK
    // already set the provider state in `RECONCILING` when `onContextChange` return a Promise
    // - Spec: https://openfeature.dev/specification/sections/providers#26-provider-context-reconciliation
    // - Blog: https://openfeature.dev/blog/reconciling-with-state/#wider-implications-stateless-providers

    //this.emitProviderEvent(ProviderEvents.Stale, { message: 'context has changed' });
    this._lastEvaluationContext = { ...newContext };
    await this.updateInternalState(newContext);
  }

  resolveNumberEvaluation(flagKey: string): ResolutionDetails<number> {
    return this.evaluate(flagKey, 'number');
  }

  resolveObjectEvaluation<T extends FlagValue>(flagKey: string): ResolutionDetails<T> {
    return this.evaluate(flagKey, 'object');
  }

  resolveStringEvaluation(flagKey: string): ResolutionDetails<string> {
    return this.evaluate(flagKey, 'string');
  }

  resolveBooleanEvaluation(flagKey: string): ResolutionDetails<boolean> {
    return this.evaluate(flagKey, 'boolean');
  }

  /**
   * Track allows to send tracking events to a tracking exporter.
   *
   * Warning: Note that you need to have a relay proxy with version 1.45.0 or upper to use this feature.
   * If you are using a version lower than 1.45.0, the events may look weird in your exporter.
   *
   * @param trackingEventName
   * @param context
   * @param trackingEventDetails
   */
  track(trackingEventName: string, context: EvaluationContext, trackingEventDetails: TrackingEventDetails): void {
    const trackingEvent: TrackingEvent = {
      kind: 'tracking',
      contextKind: context['anonymous'] ? 'anonymousUser' : 'user',
      creationDate: Math.round(Date.now() / 1000),
      key: trackingEventName,
      evaluationContext: context,
      trackingEventDetails: trackingEventDetails,
      userKey: context.targetingKey || 'undefined-targetingKey',
    };
    this._collectorManager?.add(trackingEvent);
  }

  private evaluate<T extends FlagValue>(flagKey: string, type: string): ResolutionDetails<T> {
    const resolved = this._flags.flags[flagKey];
    if (!resolved) {
      throw new FlagNotFoundError(`flag key ${flagKey} not found in cache`);
    }

    if (typeof resolved.value !== type) {
      throw new TypeMismatchError(`flag key ${flagKey} is not of type ${type}`);
    }
    return {
      variant: resolved.variant,
      value: resolved.value as T,
      flagMetadata: resolved.flagMetadata,
      errorCode: resolved.errorCode,
      errorMessage: resolved.errorMessage,
      reason: this._changeStrategy.status !== 'connected' ? StandardResolutionReasons.CACHED : resolved.reason,
    };
  }

  private isFlagResult(data: any): data is GoFeatureFlagResolvedFlags {
    return !!data?.flags;
  }

  private emitProviderEvent(event: ProviderEmittableEvents, context?: EventContext) {
    if (this._lastEmittedProviderEvent !== event) {
      this.events.emit(event, context);
      this._lastEmittedProviderEvent = event;
    }
  }

  private handleFetchAllResult(
    data: GoFeatureFlagResolvedFlags | FetchErrorHandlerResponse,
    changeEvent?: FlagChangeEvent,
  ) {
    if (this.isFlagResult(data)) {
      // New flags has been loaded, update state
      this._flags.flags = data.flags;
      this._lastFlagChangeEvent = undefined;
      // Always send a `ConfigurationChanged` and `Ready` event when successful
      if (this._lastEmittedProviderEvent) {
        this.events.emit(ProviderEvents.ConfigurationChanged, {
          message: 'flag configuration have changed',
          flagsChanged: changeEvent
            ? [...changeEvent.deleted, ...changeEvent.updated, ...changeEvent.added]
            : undefined,
        });
      }
      this.emitProviderEvent(ProviderEvents.Ready, { message: '' });
      return true;
    } else {
      // Send a ERROR event
      this._logger?.error('Fetch All Result Error', data.error);
      this.events.emit(ProviderEvents.Error, {
        message: 'Cannot get updated configurations, staying with cached values',
        metadata: { reason: data.reason || 'unknown' },
      });
      return false;
    }
  }

  private async updateInternalState(context: EvaluationContext, changeEvent?: FlagChangeEvent) {
    // if there is any inflight request, we should cancel it
    this.cancelCurrentRequest();
    // Try to get the new flags
    const data = await this.fetchAllWithRetries(context, changeEvent).catch((err) => this.handleFetchErrors(err));
    return this.handleFetchAllResult(data, changeEvent);
  }

  private async fetchAllWithRetries(context: EvaluationContext, changeEvent?: FlagChangeEvent) {
    let delay = this._retryInitialDelay;
    let attempts = 0;
    let errorDetails: FetchErrorHandlerResponse = { reason: 'unknown' };
    do {
      try {
        return await this.fetchAll(context, changeEvent);
      } catch (err) {
        // convert to error details
        errorDetails = this.handleFetchErrors(err);
        // if it's not a retriable error or if maxAttempt are reached, return it for further handling on caller side
        if (!errorDetails.retriable || attempts >= this._maxRetries) return errorDetails;
        // do retries
        attempts++;
        this._logger?.warn(
          `${GoFeatureFlagWebProvider.name}: Waiting ${delay} ms before trying to evaluate the flags (${attempts}/${this._maxRetries}).`,
        );
        await new Promise<void>((resolve) => setTimeout(() => resolve(), delay));
        delay *= this._retryDelayMultiplier;
      }
    } while (this._maxRetries);

    return errorDetails;
  }

  /**
   * fetchAll is a function that is calling GO Feature Flag to bulk evaluate flags.
   * It emits an event to notify when it is ready or on error.
   *
   * @param {EvaluationContext} context - The static evaluation context
   * @param {FlagChangeEvent} changeEvent - (optional) The event containing added/updated/removed flags
   * @private
   */
  private async fetchAll(context: EvaluationContext, changeEvent?: FlagChangeEvent) {
    const apiAbortController = new AbortController();
    const globalAbort = new DeferredPromise({ signal: this._fetchAbortController.signal });
    // if changeEvent has `updated` or `added` flags, let's call GO Feature Flag with a flagList
    // so only the changed flags are retrieved. `deleted` flags won't be available so we don't take them into account
    const payload: GoFeatureFlagAllFlagRequest = changeEvent
      ? { evaluationContext: transformContext(context, [...changeEvent.added, ...changeEvent.updated]) }
      : { evaluationContext: transformContext(context) };
    const request: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // we had the authorization header only if we have an API Key
        ...(this._customHeaders || {}),
        ...(this._apiKey ? { Authorization: `Bearer ${this._apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: apiAbortController.signal,
    };

    const fetchRequest = fetch(this._fetchAllUrl, request);
    const apiTimeout =
      this._apiTimeout > 0 ? awaitableTimeout(this._apiTimeout, { signal: apiAbortController.signal }) : undefined;

    const result = await whenAnySettle(
      apiTimeout ? [globalAbort.promise, fetchRequest, apiTimeout] : [globalAbort.promise, fetchRequest],
    );
    // let's end all the running async tasks
    apiAbortController.abort();
    globalAbort.resolve();

    if (result.promise === globalAbort.promise || globalAbort.signal?.aborted) {
      // The request has been cancelled from outside
      this._logger?.error(`${GoFeatureFlagWebProvider.name}: fetchAll operation was aborted`);
      throw new FetchAbortedError(globalAbort.signal?.reason);
    } else if (result.promise === apiTimeout) {
      // The API timed out
      this._logger?.error(
        `${GoFeatureFlagWebProvider.name}: fetchAll operation has timed out after ${this._apiTimeout}ms`,
      );
      throw new FetchTimeoutError(this._apiTimeout);
    } else if (result.error) {
      // An error occurred during the request, rethrow as-is
      throw result.error;
    }

    // If we are here, the request received a response
    const response = result.data as Response;

    if (!response.ok) {
      throw new FetchError(response.status);
    }

    const data = (await (response as Response).json()) as GOFeatureFlagAllFlagsResponse;

    // In case we are in success
    const flags = { flags: {} } as GoFeatureFlagResolvedFlags;
    for (const flagKey of Object.keys(data.flags)) {
      const resolved: FlagState<FlagValue> = data.flags[flagKey];
      const resolutionDetails: ResolutionDetails<FlagValue> = {
        value: resolved.value,
        variant: resolved.variationType,
        errorCode: resolved.errorCode,
        flagMetadata: resolved.metadata,
        reason: resolved.reason,
      };
      flags.flags[flagKey] = resolutionDetails;
    }

    // If: there is a change event
    // Then:
    // - remove eventually deleted flags from changeEvent
    // - set the added/updated flags
    // Else: return replace entirely the flags with new values
    if (changeEvent) {
      // we use a Set for a fast lookup
      const deletedFlagsSet = new Set<string>(changeEvent.deleted);
      for (const flagKey of Object.keys(this._flags.flags)) {
        // we add the flag evaluation only if it's not a deleted flag and it's not already available in the new flagset
        if (!deletedFlagsSet.has(flagKey) && !flags.flags[flagKey]) {
          flags.flags[flagKey] = this._flags.flags[flagKey];
        }
      }
    }

    return flags;
  }

  /**
   * handleFetchErrors is a function that take care of the errors that can be thrown
   * inside the FetchAll method.
   *
   * @param {Error} error - The error thrown
   * @private
   */
  private handleFetchErrors(error: unknown): FetchErrorHandlerResponse {
    if (error instanceof FetchAbortedError) {
      // The request was cancelled, just log
      this._logger?.info(`${GoFeatureFlagWebProvider.name}: ${error.message}`);
      return { reason: 'aborted', aborted: true };
    } else if (error instanceof FetchError) {
      if (error.status == 401) {
        this._logger?.error(
          `${GoFeatureFlagWebProvider.name}: invalid token used to contact GO Feature Flag instance: ${error}`,
        );
        return { reason: 'unauthorized', error };
      } else if (error.status === 404) {
        this._logger?.error(
          `${GoFeatureFlagWebProvider.name}: impossible to call go-feature-flag relay proxy ${error}`,
        );
        return { reason: 'notFound', error };
      }
    }

    this._logger?.error(`${GoFeatureFlagWebProvider.name}: unknown error while retrieving flags: ${error}`);
    return { reason: 'unknown', error, retriable: true };
  }

  /**
   * setApiKey updates the API Key for an existing provider instance
   * without having to reinitialize it. It also will update the Collector
   * Manager and will restart the WebSocket with the new API key.
   *
   * @param apiKey
   */
  async setApiKey(apiKey: string) {
    // We cancel any inflight request happening
    this.cancelCurrentRequest();
    // Set the new API Key
    this._apiKey = apiKey;
    // mark
    // Update the data collector
    this._collectorManager.setApiKey(apiKey);
    // Update the change strategy
    this._changeStrategy.setApiKey(apiKey);
    // Update the internal state
    await this.updateInternalState(this._lastEvaluationContext!);
  }
}
