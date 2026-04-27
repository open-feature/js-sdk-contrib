import type { EvaluationRequest, EvaluationResponse } from '@openfeature/ofrep-core';
import { ErrorMessageMap } from '@openfeature/ofrep-core';
import {
  type EvaluationFlagValue,
  handleEvaluationError,
  isEvaluationFailureResponse,
  OFREPApi,
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

export class OFREPWebProvider implements Provider {
  DEFAULT_POLL_INTERVAL = 30000;

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

      if (this._cacheMode === 'network-first') {
        await this._initNetworkFirst(context);
      } else {
        const loadedFromCache = await this._tryLoadFlagsFromCache(context);
        if (!loadedFromCache) {
          await this._fetchFlags(context);
        }
      }

      if (this._pollingInterval > 0) {
        this.startPolling();
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
      if (oldContext?.targetingKey !== newContext?.targetingKey) {
        this._etag = null;
        void this._storage.clear(oldContext?.targetingKey ?? '');
      }
      this._context = newContext;

      const now = new Date();
      if (this._retryPollingAfter !== undefined && this._retryPollingAfter > now) {
        return;
      }

      const loadedFromCache =
        this._cacheMode === 'local-cache-first' ? await this._tryLoadFlagsFromCache(newContext) : false;

      if (!loadedFromCache) {
        await this._fetchFlags(newContext);
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
    this._ofrepAPI.close();
    return Promise.resolve();
  }

  /**
   * network-first initialization: block on the network request; fall back to the persisted
   * cache only on transient / server errors. Auth and configuration errors (401, 403) are
   * never masked by cached values.
   */
  private async _initNetworkFirst(context?: EvaluationContext): Promise<void> {
    try {
      await this._fetchFlags(context);
    } catch (error) {
      // Auth/config errors surface immediately — no cache fallback.
      if (error instanceof OFREPApiUnauthorizedError || error instanceof OFREPForbiddenError) {
        throw error;
      }
      // Transient / server errors — try the persisted cache as a fallback.
      const cached = await this._storage.retrieve(context?.targetingKey ?? '', this._cacheTTL);
      if (!cached) {
        throw error; // No usable cache — propagate the original error.
      }
      this._isUsingCache = true;
      this._flagCache = cached.flags;
      this._etag = cached.etag;
      if (cached.metadata) {
        this._flagSetMetadataCache = cached.metadata as MetadataCache;
      }
      // Polling will retry the network on schedule.
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
  ): Promise<EvaluateFlagsResponse> {
    try {
      const evalReq: EvaluationRequest = {
        context,
      };

      const response = await this._ofrepAPI.postBulkEvaluateFlags(evalReq, this._etag);
      if (response.httpStatus === 304) {
        // nothing has changed since last time, we are doing nothing
        return { status: BulkEvaluationStatus.SUCCESS_NO_CHANGES, flags: [] };
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
      const newEtag = response.httpResponse?.headers.get('etag') ?? null;
      this._flagSetMetadataCache = toFlagMetadata(
        typeof bulkSuccessResp.metadata === 'object' ? bulkSuccessResp.metadata : {},
      );
      await this._storage.store(context?.targetingKey ?? '', newCache, newEtag, this._flagSetMetadataCache);
      this._etag = newEtag;
      this._isUsingCache = false;
      return { status: BulkEvaluationStatus.SUCCESS_WITH_CHANGES, flags: listUpdatedFlags };
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
   * Start polling for flag updates, it will call the bulk update function every pollInterval
   * @private
   */
  private startPolling() {
    this._pollingIntervalId = setInterval(() => {
      void this._refreshFlagsInBackground();
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
    const cached = await this._storage.retrieve(context?.targetingKey ?? '', this._cacheTTL);
    if (cached) {
      this._isUsingCache = true;
      this._flagCache = cached.flags;
      this._etag = cached.etag;
      if (cached.metadata) {
        this._flagSetMetadataCache = cached.metadata as MetadataCache;
      }
      void this._refreshFlagsInBackground();
      return true;
    }
    return false;
  }

  private stopPolling() {
    if (this._pollingIntervalId) {
      clearInterval(this._pollingIntervalId);
    }
  }
}
