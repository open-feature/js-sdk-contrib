import {
  AnyProviderEvent,
  ClientProviderEvents,
  EvaluationContext,
  FlagMetadata,
  FlagNotFoundError,
  FlagValue,
  GeneralError,
  Hook,
  InvalidContextError,
  JsonValue,
  Logger,
  OpenFeatureError,
  ParseError,
  Provider,
  ProviderEventEmitter,
  ProviderFatalError,
  ResolutionDetails,
  TargetingKeyMissingError,
  TypeMismatchError,
} from '@openfeature/web-sdk';
import { OfrepWebProviderOptions } from './model/ofrep-web-provider-options';
import {
  EvaluationFailureErrorCode,
  EvaluationRequest,
  EvaluationResponse,
  EvaluationSuccessResponse,
  OFREPApi,
  OFREPApiFetchError,
  OFREPApiTooManyRequestsError,
  OFREPApiUnauthorizedError,
  OFREPForbiddenError,
  RequestOptions,
} from '@openfeature/ofrep-core';
import { EvaluationStatus } from './model/evaluation-status';

export class OfrepWebProvider implements Provider {
  DEFAULT_POLL_INTERVAL = 30000;

  metadata = {
    name: OfrepWebProvider.name,
  };
  readonly runsOn = 'client';
  events?: ProviderEventEmitter<AnyProviderEvent, Record<string, unknown>> | undefined;
  hooks?: Hook[] | undefined;

  // logger is the Open Feature logger to use
  private _logger?: Logger;
  // _options is the options used to configure the provider.
  private _options: OfrepWebProviderOptions;

  private _ofrepAPI: OFREPApi;
  private _etag: string | undefined;
  private _cache: { [key: string]: ResolutionDetails<FlagValue> } = {};
  private _context: EvaluationContext | undefined;
  private _pollingIntervalId?: number;

  constructor(options: OfrepWebProviderOptions, logger?: Logger) {
    this._options = options;
    this._logger = logger;
    this._ofrepAPI = new OFREPApi(this._options.baseUrl);
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
   * @param _ - the old context (we are not using it)
   * @param newContext - the new context
   */
  async onContextChange?(_: EvaluationContext, newContext: EvaluationContext): Promise<void> {
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
      ...(this._etag ? { headers: { 'If-None-Match': this._etag } } : {}),
    };

    const response = await this._ofrepAPI.postBulkEvaluateFlags(evalReq, options);
    if (response.httpStatus === 304) {
      // nothing has changed since last time, we are doing nothing
      return EvaluationStatus.SUCCESS_NO_CHANGES;
    }

    if (response.httpStatus === 400) {
      switch (response.value.errorCode) {
        case EvaluationFailureErrorCode.TargetingKeyMissing:
          throw new TargetingKeyMissingError();
        case EvaluationFailureErrorCode.InvalidContext:
          throw new InvalidContextError();
        case EvaluationFailureErrorCode.ParseError:
          throw new ParseError();
        default:
          throw new GeneralError();
      }
    }

    if (response.httpStatus === 200) {
      const bulkSuccessResp = response.value;
      const newCache: { [key: string]: ResolutionDetails<FlagValue> } = {};

      bulkSuccessResp.flags?.forEach((evalResp: EvaluationResponse) => {
        if (evalResp.key === undefined) {
          return;
        }
        const key = evalResp.key;
        const evalSuccessResp = evalResp as EvaluationSuccessResponse;
        newCache[key] = {
          value: evalSuccessResp.value,
          flagMetadata: evalSuccessResp.metadata as FlagMetadata,
          reason: evalSuccessResp.reason,
          variant: evalSuccessResp.variant,
        };
      });
      this._cache = newCache;
      return EvaluationStatus.SUCCESS_WITH_CHANGES;
    }
    throw new GeneralError('not supposed to happen');
  }

  /**
   * Initialize the provider, it will evaluate the flags and start the polling if it is not disabled.
   * @param context - the context to use for the evaluation
   */
  async initialize?(context?: EvaluationContext | undefined): Promise<void> {
    try {
      this._context = context;
      await this._evaluateFlags(context);

      if (!this._options.disablePolling) {
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
    const pollInterval = this._options?.pollInterval ?? this.DEFAULT_POLL_INTERVAL;
    this._pollingIntervalId = setInterval(async () => {
      try {
        const res = await this._evaluateFlags(this._context);
        console.log(res);
      } catch (error) {
        this.events?.emit(ClientProviderEvents.Stale, { message: `Error while polling: ${error}` });
      }
    }, pollInterval) as unknown as number;
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
