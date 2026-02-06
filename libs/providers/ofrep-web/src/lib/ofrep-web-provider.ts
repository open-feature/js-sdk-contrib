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
import type { OFREPWebProviderOptions } from './model/ofrep-web-provider-options';

export class OFREPWebProvider implements Provider {
  DEFAULT_POLL_INTERVAL = 30000;

  readonly metadata = {
    name: 'OpenFeature Remote Evaluation Protocol Web Provider',
  };
  readonly runsOn = 'client';
  readonly events = new OpenFeatureEventEmitter();
  readonly hooks?: Hook[] | undefined;

  // logger is the Open Feature logger to use
  private _logger?: Logger;
  // _options is the options used to configure the provider.
  private _options: OFREPWebProviderOptions;
  private _ofrepAPI: OFREPApi;
  private _etag: string | null | undefined;
  private _pollingInterval: number;
  private _retryPollingAfter: Date | undefined;
  private _flagCache: FlagCache = {};
  private _flagSetMetadataCache?: MetadataCache;
  private _context: EvaluationContext | undefined;
  private _pollingIntervalId?: number;

  constructor(options: OFREPWebProviderOptions, logger?: Logger) {
    this._options = options;
    this._logger = logger;
    this._etag = null;
    this._ofrepAPI = new OFREPApi(this._options, this._options.fetchImplementation);
    this._pollingInterval = this._options.pollInterval ?? this.DEFAULT_POLL_INTERVAL;
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
      await this._fetchFlags(context);

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
    try {
      this._etag = null; // reset etag to force refetch
      this._context = newContext;

      const now = new Date();
      if (this._retryPollingAfter !== undefined && this._retryPollingAfter > now) {
        // we do nothing because we should not call the endpoint
        return;
      }

      await this._fetchFlags(newContext);
    } catch (error) {
      if (error instanceof OFREPApiTooManyRequestsError) {
        this.events?.emit(ClientProviderEvents.Stale, { message: `${error.name}: ${error.message}` });
        return;
      }

      if (
        error instanceof OpenFeatureError ||
        error instanceof OFREPApiFetchError ||
        error instanceof OFREPApiUnauthorizedError ||
        error instanceof OFREPForbiddenError
      ) {
        this.events?.emit(ClientProviderEvents.Error, { message: `${error.name}: ${error.message}` });
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
    return Promise.resolve();
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
  private async _fetchFlags(context?: EvaluationContext | undefined): Promise<EvaluateFlagsResponse> {
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

      const listUpdatedFlags = this._getListUpdatedFlags(this._flagCache, newCache);
      this._flagCache = newCache;
      this._etag = response.httpResponse?.headers.get('etag');
      this._flagSetMetadataCache = toFlagMetadata(
        typeof bulkSuccessResp.metadata === 'object' ? bulkSuccessResp.metadata : {},
      );
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

    return toResolutionDetails(response, defaultValue);
  }

  /**
   * Start polling for flag updates, it will call the bulk update function every pollInterval
   * @private
   */
  private startPolling() {
    this._pollingIntervalId = setInterval(async () => {
      try {
        const now = new Date();
        if (this._retryPollingAfter !== undefined && this._retryPollingAfter > now) {
          return;
        }
        const res = await this._fetchFlags(this._context);
        if (res.status === BulkEvaluationStatus.SUCCESS_WITH_CHANGES) {
          this.events?.emit(ClientProviderEvents.ConfigurationChanged, {
            message: 'Flags updated',
            flagsChanged: res.flags,
          });
        }
      } catch (error) {
        this.events?.emit(ClientProviderEvents.Stale, { message: `Error while polling: ${error}` });
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
