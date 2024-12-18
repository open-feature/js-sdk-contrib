import {
  InvalidContextError,
  ParseError,
  StandardResolutionReasons,
  TargetingKeyMissingError,
} from '@openfeature/core';
import {
  EvaluationFailureErrorCode,
  EvaluationRequest,
  EvaluationResponse,
  OFREPApi,
  OFREPApiFetchError,
  OFREPApiTooManyRequestsError,
  OFREPApiUnauthorizedError,
  OFREPForbiddenError,
  handleEvaluationError,
  isEvaluationFailureResponse,
  isEvaluationSuccessResponse,
} from '@openfeature/ofrep-core';
import {
  ClientProviderEvents,
  EvaluationContext,
  FlagMetadata,
  FlagNotFoundError,
  FlagValue,
  GeneralError,
  Hook,
  JsonValue,
  Logger,
  OpenFeatureError,
  OpenFeatureEventEmitter,
  Provider,
  ProviderFatalError,
  ResolutionDetails,
  TypeMismatchError,
} from '@openfeature/web-sdk';
import { BulkEvaluationStatus, EvaluateFlagsResponse } from './model/evaluate-flags-response';
import { FlagCache } from './model/in-memory-cache';
import { OFREPWebProviderOptions } from './model/ofrep-web-provider-options';
import { isResolutionError } from './model/resolution-error';

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
  private _etag: string | null;
  private _pollingInterval: number;
  private _retryPollingAfter: Date | undefined;
  private _flagCache: FlagCache = {};
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
      await this._evaluateFlags(context);

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
    return this.evaluate(flagKey, 'boolean');
  }
  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): ResolutionDetails<string> {
    return this.evaluate(flagKey, 'string');
  }
  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): ResolutionDetails<number> {
    return this.evaluate(flagKey, 'number');
  }
  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
  ): ResolutionDetails<T> {
    return this.evaluate(flagKey, 'object');
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  /**
   * onContextChange is called when the context changes, it will re-evaluate the flags with the new context
   * and update the cache.
   * @param oldContext - the old evaluation context
   * @param newContext - the new evaluation context
   */
  async onContextChange(oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    try {
      this._context = newContext;

      const now = new Date();
      if (this._retryPollingAfter !== undefined && this._retryPollingAfter > now) {
        // we do nothing because we should not call the endpoint
        return;
      }

      await this._evaluateFlags(newContext);
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
   * _evaluateFlags is a function that will call the bulk evaluate flags endpoint to get the flags values.
   * @param context - the context to use for the evaluation
   * @private
   * @returns EvaluationStatus if the evaluation the API returned a 304, 200.
   * @throws TargetingKeyMissingError if the API returned a 400 with the error code TargetingKeyMissing
   * @throws InvalidContextError if the API returned a 400 with the error code InvalidContext
   * @throws ParseError if the API returned a 400 with the error code ParseError
   * @throws GeneralError if the API returned a 400 with an unknown error code
   */
  private async _evaluateFlags(context?: EvaluationContext | undefined): Promise<EvaluateFlagsResponse> {
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
        handleEvaluationError(response);
      }

      const bulkSuccessResp = response.value;
      const newCache: FlagCache = {};

      bulkSuccessResp.flags?.forEach((evalResp: EvaluationResponse) => {
        if (isEvaluationFailureResponse(evalResp)) {
          newCache[evalResp.key] = {
            errorCode: evalResp.errorCode,
            errorDetails: evalResp.errorDetails,
            reason: StandardResolutionReasons.ERROR,
          };
        }

        if (isEvaluationSuccessResponse(evalResp) && evalResp.key) {
          newCache[evalResp.key] = {
            value: evalResp.value,
            flagMetadata: evalResp.metadata as FlagMetadata,
            reason: evalResp.reason,
            variant: evalResp.variant,
          };
        }
      });
      const listUpdatedFlags = this._getListUpdatedFlags(this._flagCache, newCache);
      this._flagCache = newCache;
      this._etag = response.httpResponse?.headers.get('etag');
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
   * Evaluate is a function retrieving the value from a flag in the cache.
   * @param flagKey - name of the flag to retrieve
   * @param type - type of the flag
   * @private
   */
  private evaluate<T extends FlagValue>(flagKey: string, type: string): ResolutionDetails<T> {
    const resolved = this._flagCache[flagKey];
    if (!resolved) {
      throw new FlagNotFoundError(`flag key ${flagKey} not found in cache`);
    }

    if (isResolutionError(resolved)) {
      switch (resolved.errorCode) {
        case EvaluationFailureErrorCode.FlagNotFound:
          throw new FlagNotFoundError(`flag key ${flagKey} not found: ${resolved.errorDetails}`);
        case EvaluationFailureErrorCode.TargetingKeyMissing:
          throw new TargetingKeyMissingError(`targeting key missing for flag key ${flagKey}: ${resolved.errorDetails}`);
        case EvaluationFailureErrorCode.InvalidContext:
          throw new InvalidContextError(`invalid context for flag key ${flagKey}: ${resolved.errorDetails}`);
        case EvaluationFailureErrorCode.ParseError:
          throw new ParseError(`parse error for flag key ${flagKey}: ${resolved.errorDetails}`);
        case EvaluationFailureErrorCode.General:
        default:
          throw new GeneralError(
            `general error during flag evaluation for flag key ${flagKey}: ${resolved.errorDetails}`,
          );
      }
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
      reason: resolved.reason,
    };
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
        const res = await this._evaluateFlags(this._context);
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
