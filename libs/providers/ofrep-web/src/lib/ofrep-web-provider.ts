import type {
  BulkEvaluationRefetchMetadata,
  EvaluationRequest,
  EvaluationResponse,
  EventStream,
} from '@openfeature/ofrep-core';
import {
  ErrorMessageMap,
  type EvaluationFlagValue,
  handleEvaluationError,
  isEvaluationFailureResponse,
  OFREPApi,
  OFREPApiError,
  OFREPApiFetchError,
  OFREPApiTooManyRequestsError,
  OFREPApiUnauthorizedError,
  OFREPApiUnexpectedResponseError,
  OFREPForbiddenError,
  toFlagMetadata,
  toResolutionDetails,
} from '@openfeature/ofrep-core';
import type {
  EvaluationContext,
  FlagValue,
  Hook,
  JsonValue,
  Logger,
  Provider,
  ResolutionDetails,
} from '@openfeature/web-sdk';
import {
  ClientProviderEvents,
  ErrorCode,
  GeneralError,
  OpenFeatureError,
  OpenFeatureEventEmitter,
  ProviderFatalError,
  StandardResolutionReasons,
} from '@openfeature/web-sdk';
import type { EvaluateFlagsResponse } from './model/evaluate-flags-response';
import { BulkEvaluationStatus } from './model/evaluate-flags-response';
import type { FlagCache, MetadataCache } from './model/in-memory-cache';
import type { CacheMode, OFREPWebProviderOptions } from './model/ofrep-web-provider-options';
import { DEFAULT_CACHE_TTL_SECONDS } from './model/ofrep-web-provider-options';
import { Storage } from './store/storage';
import { SseManager } from './sse-manager';

export class OFREPWebProvider implements Provider {
  DEFAULT_POLL_INTERVAL = 0;

  readonly metadata = {
    name: 'OpenFeature Remote Evaluation Protocol Web Provider',
  };
  readonly runsOn = 'client';
  readonly events = new OpenFeatureEventEmitter();
  readonly hooks?: Hook[] | undefined;

  private _logger?: Logger;
  private _options: OFREPWebProviderOptions;
  private _ofrepAPI: OFREPApi;
  private _etag: string | null | undefined;
  private _pollingInterval: number;
  private _retryPollingAfter: Date | undefined;
  private _flagCache: FlagCache = {};
  private _flagSetMetadataCache?: MetadataCache;
  private _isUsingCache: boolean;
  private _context: EvaluationContext | undefined;
  private _pollingIntervalId?: number;
  private _storage: Storage;
  private _cacheMode: CacheMode;
  private _cacheTTL: number;
  private _contextRevision = 0;
  private _isFetching = false;
  private _visibilityChangeHandler = this._onVisibilityChange.bind(this);
  private _sseManager?: SseManager;
  private _sseRetryCount = 0;
  private _sseRetryTimerId?: ReturnType<typeof setTimeout>;
  private _eventStreams?: EventStream[];

  constructor(options: OFREPWebProviderOptions, logger?: Logger) {
    this._options = options;
    this._logger = logger;
    this._etag = null;
    this._ofrepAPI = new OFREPApi(this._options, this._options.fetchImplementation);
    this._pollingInterval = this._options.pollInterval ?? this.DEFAULT_POLL_INTERVAL;
    this._cacheMode = this._options.cacheMode ?? 'local-cache-first';
    this._cacheTTL = this._options.cacheTTL ?? DEFAULT_CACHE_TTL_SECONDS;
    this._storage = new Storage(this._cacheMode, this._options.cacheKeyPrefix, logger);
    this._isUsingCache = false;
  }

  /**
   * Returns a shallow copy of the flag cache, which is updated at initialization/context-change/configuration-change once the flags are re-evaluated.
   */
  get flagCache(): FlagCache {
    return { ...this._flagCache };
  }

  /**
   * Initialize the provider, it will evaluate the flags and start the polling if it is not disabled.
   * @param context - the context to use for the evaluation
   */
  async initialize(context?: EvaluationContext | undefined): Promise<void> {
    try {
      this._context = context;

      let result: EvaluateFlagsResponse | undefined;
      if (this._cacheMode === 'network-first') {
        result = await this._initNetworkFirst(context);
      } else {
        const loadedFromCache = await this._tryLoadFlagsFromCache(context);
        if (!loadedFromCache) {
          result = await this._fetchFlags(context);
        }
      }

      if (result) {
        this._connectSseIfAvailable(result);
      }

      const changeDetection = this._options.changeDetection ?? 'sse';
      if (!this._sseManager && this._pollingInterval > 0 && changeDetection !== 'none') {
        this.startPolling();
      }

      if (!this._options.disableVisibilityRefresh && typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this._visibilityChangeHandler);
      }

      this._logger?.debug(`${this.metadata.name} initialized successfully`);
    } catch (error) {
      if (error instanceof OFREPApiUnauthorizedError || error instanceof OFREPForbiddenError) {
        throw new ProviderFatalError('Initialization failed', { cause: error });
      }
      throw error;
    }
  }

  /* eslint-disable @typescript-eslint/no-unused-vars*/
  /* to make overrides easier we keep these unused vars */
  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): ResolutionDetails<boolean> {
    return this._resolve(flagKey, defaultValue);
  }
  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): ResolutionDetails<string> {
    return this._resolve(flagKey, defaultValue);
  }
  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): ResolutionDetails<number> {
    return this._resolve(flagKey, defaultValue);
  }
  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
  ): ResolutionDetails<T> {
    return this._resolve(flagKey, defaultValue);
  }

  /**
   * onContextChange is called when the context changes, it will re-evaluate the flags with the new context
   * and update the cache.
   * @param oldContext - the old evaluation context
   * @param newContext - the new evaluation context
   */
  async onContextChange(oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    this._contextRevision++;
    try {
      const oldStorageKey = await this._storage.getStorageKey(this._options.baseUrl, oldContext);
      const newStorageKey = await this._storage.getStorageKey(this._options.baseUrl, newContext);
      if (oldStorageKey !== newStorageKey) {
        this._etag = null;
        await this._storage.clear(this._options.baseUrl, oldContext);
      }
      this._context = newContext;

      const now = new Date();
      if (this._retryPollingAfter !== undefined && this._retryPollingAfter > now) {
        return;
      }

      const loadedFromCache =
        this._cacheMode === 'local-cache-first' ? await this._tryLoadFlagsFromCache(newContext) : false;

      if (!loadedFromCache) {
        // Context change: re-fetch without SSE metadata
        const result = await this._fetchFlags(newContext);
        this._connectSseIfAvailable(result);
        const changeDetection = this._options.changeDetection ?? 'sse';
        if (!this._sseManager && this._pollingInterval > 0 && !this._pollingIntervalId && changeDetection !== 'none') {
          this.startPolling();
        }
      }
    } catch (error) {
      if (error instanceof OFREPApiTooManyRequestsError) {
        this.events?.emit(ClientProviderEvents.Stale, { message: `${error.name}: ${error.message}` });
        return;
      }

      if (error instanceof OFREPApiUnauthorizedError || error instanceof OFREPForbiddenError) {
        this._logger?.error(`Auth/config error during context change: ${error.name}: ${error.message}`);
        this.events?.emit(ClientProviderEvents.Error, { message: `${error.name}: ${error.message}` });
        return;
      }

      if (
        error instanceof OpenFeatureError ||
        error instanceof OFREPApiFetchError ||
        error instanceof OFREPApiUnexpectedResponseError
      ) {
        this.events?.emit(ClientProviderEvents.Error, {
          message: `${(error as Error).name}: ${(error as Error).message}`,
        });
        return;
      }
      this.events?.emit(ClientProviderEvents.Error, { message: `Unknown error: ${error}` });
    }
  }

  /**
   * onClose is called when the provider is closed, it will stop the polling if it is enabled.
   */
  onClose?(): Promise<void> {
    this.stopPolling();
    this._clearSseRetry();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityChangeHandler);
    }
    this._sseManager?.dispose();
    this._sseManager = undefined;
    this._ofrepAPI.close();
    return Promise.resolve();
  }

  /**
   * network-first initialization: block on the network request; fall back to the persisted
   * cache only on transient or server errors (5xx, network unavailable, timeout).
   * Auth and configuration errors (401, 403, 400, 404) are never masked by cached values.
   */
  private async _initNetworkFirst(context?: EvaluationContext): Promise<EvaluateFlagsResponse | undefined> {
    try {
      return await this._fetchFlags(context);
    } catch (error) {
      // Auth and configuration errors surface immediately — no cache fallback.
      // 5xx and other transient errors fall through to the persisted cache.
      const status = error instanceof OFREPApiError ? error.response?.status : undefined;
      if (
        error instanceof OFREPApiUnauthorizedError ||
        error instanceof OFREPForbiddenError ||
        error instanceof OpenFeatureError ||
        status === 400 ||
        status === 404
      ) {
        throw error;
      }
      // Transient / server errors (5xx, network failures, timeouts) — try the persisted cache as a fallback.
      const cached = await this._storage.retrieve(this._options.baseUrl, context, this._cacheTTL);
      if (!cached) {
        throw error; // No usable cache — propagate the original error.
      }
      this._isUsingCache = true;
      this._flagCache = cached.flags;
      this._etag = cached.etag;
      if (cached.metadata) {
        this._flagSetMetadataCache = cached.metadata as MetadataCache;
      }
      this._eventStreams = cached.eventStreams;

      // Serving from cache after a transient network failure. Surface the persisted
      // event streams so the caller can establish SSE without waiting for a 200 — a
      // subsequent successful request may be a 304 that carries no eventStreams.
      return this._eventStreams?.length
        ? { status: BulkEvaluationStatus.SUCCESS_NO_CHANGES, flags: [], eventStreams: this._eventStreams }
        : undefined;
    }
  }

  /**
   * _fetchFlags is a function that will call the bulk evaluate flags endpoint to get the flags values.
   * @param context - the context to use for the evaluation
   * @private
   * @returns EvaluationStatus if the evaluation the API returned a 304, 200.
   * @throws TargetingKeyMissingError if the API returned a 400 with the error code TargetingKeyMissing
   * @throws InvalidContextError if the API returned a 400 with the error code InvalidContext
   * @throws ParseError if the API returned a 400 with the error code ParseError
   * @throws GeneralError if the API returned a 400 with an unknown error code
   */
  private async _fetchFlags(
    context?: EvaluationContext | undefined,
    generation = this._contextRevision,
    sseMetadata?: BulkEvaluationRefetchMetadata,
    unconditional?: boolean,
  ): Promise<EvaluateFlagsResponse> {
    try {
      const evalReq: EvaluationRequest = {
        context,
      };

      // ADR-0008 guideline #3: inactivity resume re-fetches must be fully
      // unconditional (no If-None-Match, no flagConfigEtag/flagConfigLastModified).
      const etag = unconditional ? null : this._etag;
      const response = await this._ofrepAPI.postBulkEvaluateFlags(evalReq, etag, sseMetadata);
      if (response.httpStatus === 304) {
        // A 304 has no body, so the server does not (re)send eventStreams. Surface the
        // last-known streams so SSE can still be (re)connected when flags are unchanged.
        return { status: BulkEvaluationStatus.SUCCESS_NO_CHANGES, flags: [], eventStreams: this._eventStreams };
      }

      if (response.httpStatus !== 200) {
        throw new GeneralError(`Failed OFREP bulk evaluation request, status: ${response.httpStatus}`);
      }

      const bulkSuccessResp = response.value;
      if (!('flags' in bulkSuccessResp) || !Array.isArray(bulkSuccessResp.flags)) {
        throw new Error('No flags in OFREP bulk evaluation response');
      }

      const newCache = bulkSuccessResp.flags.reduce<FlagCache>((currentCache, currentResponse) => {
        if (currentResponse.key) {
          currentCache[currentResponse.key] = currentResponse;
        }
        return currentCache;
      }, {});

      if (generation !== this._contextRevision) {
        return { status: BulkEvaluationStatus.SUCCESS_NO_CHANGES, flags: [] };
      }

      const listUpdatedFlags = this._getListUpdatedFlags(this._flagCache, newCache);
      this._flagCache = newCache;
      this._eventStreams = bulkSuccessResp.eventStreams;
      const newEtag = response.httpResponse?.headers.get('etag') ?? null;
      this._flagSetMetadataCache = toFlagMetadata(
        typeof bulkSuccessResp.metadata === 'object' ? bulkSuccessResp.metadata : {},
      );
      await this._storage.store(
        this._options.baseUrl,
        context,
        newCache,
        newEtag,
        this._flagSetMetadataCache,
        this._eventStreams,
      );
      this._etag = newEtag;
      this._isUsingCache = false;
      return {
        status: BulkEvaluationStatus.SUCCESS_WITH_CHANGES,
        flags: listUpdatedFlags,
        eventStreams: bulkSuccessResp.eventStreams,
      };
    } catch (error) {
      if (error instanceof OFREPApiTooManyRequestsError && error.retryAfterDate !== null) {
        this._retryPollingAfter = error.retryAfterDate;
      }
      throw error;
    }
  }

  /**
   * _getListUpdatedFlags is a function that will compare the old cache with the new cache and
   * return the list of flags that have been updated / deleted / created.
   * @param oldCache
   * @param newCache
   * @private
   */
  private _getListUpdatedFlags(oldCache: FlagCache, newCache: FlagCache): string[] {
    const changedKeys: string[] = [];
    const oldKeys = Object.keys(oldCache);
    const newKeys = Object.keys(newCache);

    // Check for added or modified keys in newCache
    for (const key in newCache) {
      if (oldKeys.indexOf(key) === -1 || JSON.stringify(oldCache[key]) !== JSON.stringify(newCache[key])) {
        changedKeys.push(key);
      }
    }

    // Check for removed keys in oldCache
    for (const key in oldCache) {
      if (newKeys.indexOf(key) === -1) {
        changedKeys.push(key);
      }
    }

    return changedKeys;
  }

  /**
   * _resolve is a function retrieving the value from a flag in the cache.
   * @param flagKey - name of the flag to retrieve
   * @param type - type of the flag
   * @param defaultValue - default value
   * @private
   */
  private _resolve<T extends FlagValue>(flagKey: string, defaultValue: T): ResolutionDetails<T> {
    const resolved = this._flagCache[flagKey];

    if (!resolved) {
      return {
        value: defaultValue,
        flagMetadata: this._flagSetMetadataCache,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: ErrorMessageMap[ErrorCode.FLAG_NOT_FOUND],
      };
    }

    return this.responseToResolutionDetails(resolved, defaultValue);
  }

  private responseToResolutionDetails<T extends EvaluationFlagValue>(
    response: EvaluationResponse,
    defaultValue: T,
  ): ResolutionDetails<T> {
    if (isEvaluationFailureResponse(response)) {
      return handleEvaluationError(response, defaultValue);
    }
    const resolution = toResolutionDetails(response, defaultValue);
    if (this._isUsingCache) {
      resolution.reason = StandardResolutionReasons.CACHED;
    }
    return resolution;
  }

  /**
   * Fetches flags and emits the appropriate events based on the result.
   * Uses a concurrency guard to prevent overlapping requests.
   * @param reason - a short description of what triggered the refresh (used in event messages)
   * @private
   */
  private async _refreshFlags(reason: string, emitStaleOnError = true): Promise<void> {
    if (this._isFetching) {
      return;
    }

    const now = new Date();
    if (this._retryPollingAfter !== undefined && this._retryPollingAfter > now) {
      return;
    }

    this._isFetching = true;
    try {
      const res = await this._fetchFlags(this._context);
      if (res.status === BulkEvaluationStatus.SUCCESS_WITH_CHANGES) {
        this.events?.emit(ClientProviderEvents.ConfigurationChanged, {
          message: `Flags updated (${reason})`,
          flagsChanged: res.flags,
        });
      }
    } catch (error) {
      if (emitStaleOnError) {
        this.events?.emit(ClientProviderEvents.Stale, {
          message: `Error while refreshing flags (${reason}): ${error}`,
        });
      } else {
        this._logger?.warn(`Error while refreshing flags (${reason}): ${error}`);
      }
    } finally {
      this._isFetching = false;
    }
  }

  /**
   * Connect to SSE event streams if present in the response.
   * If SSE connects, stop polling; if no SSE, does not start polling
   * (that is handled by the caller).
   */
  private _connectSseIfAvailable(result: EvaluateFlagsResponse): void {
    const changeDetection = this._options.changeDetection ?? 'sse';

    if (result.eventStreams && result.eventStreams.length > 0 && changeDetection === 'sse') {
      if (!this._sseManager && typeof EventSource === 'undefined') {
        this._logger?.debug('EventSource is unavailable; skipping SSE connection');
        return;
      }
      this.stopPolling();
      this._clearSseRetry();
      if (!this._sseManager) {
        this._sseManager = new SseManager(
          {
            onRefetch: (metadata) => this._handleSseRefetch(metadata),
            onStale: () => this._handleSseStale(),
            onError: () => this._handleSseError(),
          },
          this._options.inactivityDelaySec,
          this._logger,
          this._options.baseUrl,
        );
      }
      this._sseManager.connect(result.eventStreams);
      this._sseRetryCount = 0;
    } else if (this._sseManager) {
      this._sseManager.dispose();
      this._sseManager = undefined;
    }
  }

  /**
   * Handle an SSE refetchEvaluation event.
   */
  private async _handleSseRefetch(metadata?: BulkEvaluationRefetchMetadata): Promise<void> {
    try {
      const isInactivityResume = metadata === undefined;
      const res = await this._fetchFlags(this._context, undefined, metadata, isInactivityResume);
      if (res.status === BulkEvaluationStatus.SUCCESS_WITH_CHANGES) {
        this.events?.emit(ClientProviderEvents.ConfigurationChanged, {
          message: 'Flags updated',
          flagsChanged: res.flags,
        });
      }
    } catch (error) {
      this.events?.emit(ClientProviderEvents.Stale, { message: `Error during SSE re-fetch: ${error}` });
    }
  }

  /**
   * Handle SSE transient errors — emit stale while EventSource auto-reconnects.
   */
  private _handleSseStale(): void {
    this.events?.emit(ClientProviderEvents.Stale, {
      message: 'SSE connection interrupted — attempting to reconnect',
    });
  }

  /**
   * Handle SSE connection errors.
   * Falls back to polling when enabled; otherwise retries SSE with exponential backoff.
   */
  private _handleSseError(): void {
    if (!this._sseManager) {
      return;
    }

    // Fall back to polling if it's enabled and not already running
    if (this._pollingInterval > 0 && !this._pollingIntervalId) {
      this._logger?.info('SSE error — falling back to polling');
      this._sseManager.dispose();
      this._sseManager = undefined;
      this.startPolling();
      return;
    }

    // Polling is disabled — retry SSE with exponential backoff (1 s → 2 s → 4 s … capped at 60 s)
    const changeDetection = this._options.changeDetection ?? 'sse';
    if (this._pollingInterval === 0 && changeDetection !== 'none') {
      const delayMs = Math.min(1_000 * Math.pow(2, this._sseRetryCount), 60_000);
      this._sseRetryCount++;
      this._logger?.info(`SSE error — polling disabled, retrying SSE in ${delayMs}ms (attempt ${this._sseRetryCount})`);
      this._sseRetryTimerId = setTimeout(async () => {
        this._sseRetryTimerId = undefined;
        try {
          const result = await this._fetchFlags(this._context);
          this._connectSseIfAvailable(result);
        } catch (error) {
          this._logger?.warn(`SSE retry fetchFlags failed: ${error} — scheduling next attempt`);
          this._handleSseError();
        }
      }, delayMs);
    }
  }

  private _clearSseRetry(): void {
    if (this._sseRetryTimerId !== undefined) {
      clearTimeout(this._sseRetryTimerId);
      this._sseRetryTimerId = undefined;
    }
  }

  /**
   * Start polling for flag updates, it will call the bulk update function every pollInterval
   * @private
   */
  private startPolling() {
    this._pollingIntervalId = setInterval(() => {
      this._refreshFlags('polling');
    }, this._pollingInterval) as unknown as number;
  }

  private async _refreshFlagsInBackground(): Promise<void> {
    const now = new Date();
    if (this._retryPollingAfter !== undefined && this._retryPollingAfter > now) {
      return;
    }
    try {
      const res = await this._fetchFlags(this._context);
      if (res.status === BulkEvaluationStatus.SUCCESS_WITH_CHANGES) {
        // A fresh 200 response may carry eventStreams — establish SSE if available.
        // Only on SUCCESS_WITH_CHANGES (not 304/stale) to avoid racing with a
        // concurrent context-change that may have already set up a newer SSE manager.
        this._connectSseIfAvailable(res);
        this.events?.emit(ClientProviderEvents.ConfigurationChanged, {
          message: 'Flags updated',
          flagsChanged: res.flags,
        });
      }
    } catch (error) {
      if (error instanceof OFREPApiTooManyRequestsError) {
        this.events?.emit(ClientProviderEvents.Stale, { message: `${error.name}: ${error.message}` });
        return;
      }

      if (error instanceof OFREPApiUnauthorizedError || error instanceof OFREPForbiddenError) {
        this._logger?.error(`Auth/config error during background refresh: ${error.name}: ${error.message}`);
        this.events?.emit(ClientProviderEvents.Error, { message: `${error.name}: ${error.message}` });
        return;
      }

      this.events?.emit(ClientProviderEvents.Stale, { message: `Error while polling: ${error}` });
    }
  }

  private async _tryLoadFlagsFromCache(context?: EvaluationContext | undefined): Promise<boolean> {
    const cached = await this._storage.retrieve(this._options.baseUrl, context, this._cacheTTL);
    if (cached) {
      this._isUsingCache = true;
      this._flagCache = cached.flags;
      this._etag = cached.etag;
      if (cached.metadata) {
        this._flagSetMetadataCache = cached.metadata as MetadataCache;
      }
      this._eventStreams = cached.eventStreams;

      // Connect SSE from the persisted streams: the background refresh below sends
      // If-None-Match and will receive a 304 (no body, no eventStreams) when flags are
      // unchanged, so we must rely on the cached configuration to establish SSE here.
      if (this._eventStreams?.length) {
        this._connectSseIfAvailable({
          status: BulkEvaluationStatus.SUCCESS_NO_CHANGES,
          flags: [],
          eventStreams: this._eventStreams,
        });
      }
      void this._refreshFlagsInBackground();
      return true;
    }
    return false;
  }

  private stopPolling() {
    if (this._pollingIntervalId) {
      clearInterval(this._pollingIntervalId);
      this._pollingIntervalId = undefined;
    }
  }

  /**
   * Handler for visibility changes (page/app becoming visible)
   * Re-fetches flags when the document becomes visible
   * @private
   */
  private _onVisibilityChange() {
    if (document?.visibilityState === 'visible') {
      // Suppress STALE on failure: a single missed refresh doesn't mean the cache is stale.
      this._refreshFlags('visibility change', false);
    }
  }
}
