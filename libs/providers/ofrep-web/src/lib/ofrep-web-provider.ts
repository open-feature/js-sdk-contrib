import {
  AnyProviderEvent,
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
  ProviderEventEmitter,
  ProviderFatalError,
  ResolutionDetails,
  TypeMismatchError,
} from '@openfeature/web-sdk';
import { OfrepWebProviderOptions } from './model/ofrep-web-provider-options';
import {
  EvaluationFailureErrorCode,
  EvaluationRequest,
  EvaluationResponse,
  handleEvaluationError,
  isEvaluationFailureResponse,
  isEvaluationSuccessResponse,
  OFREPApi,
  OFREPApiFetchError,
  OFREPApiTooManyRequestsError,
  OFREPApiUnauthorizedError,
  OFREPForbiddenError,
  RequestOptions,
} from '@openfeature/ofrep-core';
import { EvaluationStatus } from './model/evaluation-status';
import {
  InvalidContextError,
  ParseError,
  StandardResolutionReasons,
  TargetingKeyMissingError,
} from '@openfeature/core';
import { isResolutionError, ResolutionError } from './model/resolutionError';

export class OfrepWebProvider implements Provider {
  DEFAULT_POLL_INTERVAL = 30000;

  metadata = {
    name: OfrepWebProvider.name,
  };
  readonly runsOn = 'client';
  events = new OpenFeatureEventEmitter();
  hooks?: Hook[] | undefined;

  // logger is the Open Feature logger to use
  private _logger?: Logger;
  // _options is the options used to configure the provider.
  private _options: OfrepWebProviderOptions;

  private _ofrepAPI: OFREPApi;
  private _etag: string | null;
  private pollingInterval: number;
  private _cache: { [key: string]: ResolutionDetails<FlagValue> | ResolutionError } = {};
  private _context: EvaluationContext | undefined;
  private _pollingIntervalId?: number;

  constructor(options: OfrepWebProviderOptions, logger?: Logger) {
    this._options = options;
    this._logger = logger;
    this._etag = null;
    this._ofrepAPI = new OFREPApi(this._options.baseUrl);
    this.pollingInterval = this._options.pollInterval ?? this.DEFAULT_POLL_INTERVAL;
  }

  resolveBooleanEvaluation(flagKey: string): ResolutionDetails<boolean> {
    return this.evaluate(flagKey, 'boolean');
  }
  resolveStringEvaluation(flagKey: string): ResolutionDetails<string> {
    return this.evaluate(flagKey, 'string');
  }
  resolveNumberEvaluation(flagKey: string): ResolutionDetails<number> {
    return this.evaluate(flagKey, 'number');
  }
  resolveObjectEvaluation<T extends JsonValue>(flagKey: string): ResolutionDetails<T> {
    return this.evaluate(flagKey, 'object');
  }

  /**
   * onContextChange is called when the context changes, it will re-evaluate the flags with the new context
   * and update the cache.
   * @param oldContext - the old evaluation context
   * @param newContext - the new evaluation context
   */
  async onContextChange(oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    try {
      this._context = newContext;
      await this._evaluateFlags(newContext);
    } catch (error) {
      if (
        error instanceof OpenFeatureError ||
        error instanceof OFREPApiFetchError ||
        error instanceof OFREPApiTooManyRequestsError ||
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
  private async _evaluateFlags(context?: EvaluationContext | undefined): Promise<EvaluationStatus> {
    const evalReq: EvaluationRequest = {
      context,
    };
    const options: RequestOptions = {
      headers: new Headers({
        'Content-Type': 'application/json',
      }),
      ...(this._etag !== null ? { headers: { 'If-None-Match': this._etag } } : {}),
    };

    const response = await this._ofrepAPI.postBulkEvaluateFlags(evalReq, options);
    if (response.httpStatus === 304) {
      // nothing has changed since last time, we are doing nothing
      return EvaluationStatus.SUCCESS_NO_CHANGES;
    }

    if (response.httpStatus === 400) {
      handleEvaluationError(response);
    }

    if (response.httpStatus === 200) {
      const bulkSuccessResp = response.value;
      const newCache: { [key: string]: ResolutionDetails<FlagValue> | ResolutionError } = {};

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
      this._cache = newCache;
      this._etag = response.httpResponse?.headers.get('etag');
      return EvaluationStatus.SUCCESS_WITH_CHANGES;
    }
    throw new GeneralError('Unexpected error happen during the evaluation');
  }

  /**
   * Initialize the provider, it will evaluate the flags and start the polling if it is not disabled.
   * @param context - the context to use for the evaluation
   */
  async initialize?(context?: EvaluationContext | undefined): Promise<void> {
    try {
      this._context = context;
      await this._evaluateFlags(context);

      if (this.pollingInterval > 0) {
        this.startPolling();
      }

      this._logger?.debug(`${this.metadata.name} initialized successfully`);
    } catch (error) {
      if (error instanceof OFREPApiUnauthorizedError || error instanceof OFREPForbiddenError) {
        throw new ProviderFatalError('Initialization failed', error);
      }
      throw error;
    }
  }

  /**
   * Evaluate is a function retrieving the value from a flag in the cache.
   * @param flagKey - name of the flag to retrieve
   * @param type - type of the flag
   * @private
   */
  private evaluate<T extends FlagValue>(flagKey: string, type: string): ResolutionDetails<T> {
    const resolved = this._cache[flagKey];
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
        const res = await this._evaluateFlags(this._context);
        if (res === EvaluationStatus.SUCCESS_WITH_CHANGES) {
          this.events?.emit(ClientProviderEvents.ConfigurationChanged, { message: 'Flags updated' });
        }
      } catch (error) {
        this.events?.emit(ClientProviderEvents.Stale, { message: `Error while polling: ${error}` });
      }
    }, this.pollingInterval) as unknown as number;
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