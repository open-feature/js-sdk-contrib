import type { Logger } from '@openfeature/core';
import {
  ErrorCode,
  OpenFeatureError,
  type EvaluationContext,
  type EvaluationDetails,
  type FlagValue,
  type BaseHook,
  type HookContext,
  type HookHints,
} from '@openfeature/core';
import { FixedSizeExpiringCache } from './utils/fixed-size-expiring-cache';

const DEFAULT_CACHE_KEY_SUPPLIER = (flagKey: string) => flagKey;
type StageResult = EvaluationContext | true | CachedError;
type HookStagesEntry = { before?: StageResult; after?: StageResult; error?: StageResult; finally?: StageResult };
type Stage = 'before' | 'after' | 'error' | 'finally';

/**
 * An error cached from a previous hook invocation.
 */
export class CachedError extends OpenFeatureError {
  private _innerError: unknown;

  constructor(innerError: unknown) {
    super();
    Object.setPrototypeOf(this, CachedError.prototype);
    this.name = 'CachedError';
    this._innerError = innerError;
  }

  /**
   * The original error.
   */
  get innerError() {
    return this._innerError;
  }

  get code() {
    if (this._innerError instanceof OpenFeatureError) {
      return this._innerError.code;
    }
    return ErrorCode.GENERAL;
  }
}

export type Options = {
  /**
   * Function to generate the cache key for the wrapped hook.
   * If the cache key is found in the cache, the hook stage will not run.
   * By default, the flag key is used as the cache key.
   *
   * @param flagKey the flag key
   * @param context the evaluation context
   * @returns cache key for this stage
   * @default (flagKey) => flagKey
   */
  cacheKeySupplier?: (flagKey: string, context: EvaluationContext) => string | null | undefined;
  /**
   * Whether or not to debounce and cache the errors thrown by hook stages.
   * If false (default) stages that throw will not be debounced and their errors not cached.
   * If true, stages that throw will be debounced and their errors cached and re-thrown for the debounced period.
   */
  cacheErrors?: boolean;
  /**
   * Debounce timeout - how long to wait before the hook can fire again (applied to each stage independently) in milliseconds.
   */
  debounceTime: number;
  /**
   * Max number of items to be kept in cache before the oldest entry falls out.
   */
  maxCacheItems: number;
  /**
   * Optional logger.
   */
  logger?: Logger;
};

/**
 * A hook that wraps another hook and debounces its execution based on the provided options.
 * The cacheKeySupplier is used to generate a cache key for the hook, which is used to determine if the hook should be executed or skipped.
 * If no cache key supplier is provided for a stage, that stage will always run.
 */
export class DebounceHook<T extends FlagValue = FlagValue> implements BaseHook {
  private readonly cache: FixedSizeExpiringCache<HookStagesEntry>;
  private readonly cacheErrors: boolean;
  private readonly cacheKeySupplier: Options['cacheKeySupplier'];

  public constructor(
    // this is a superset of web and server hook forms; validated by the test suite
    private readonly innerHook: BaseHook<
      FlagValue,
      Record<string, unknown>,
      Promise<EvaluationContext | void> | EvaluationContext | void,
      Promise<void> | void
    >,
    private readonly options: Options,
  ) {
    this.cacheErrors = options.cacheErrors ?? false;
    this.cacheKeySupplier = options.cacheKeySupplier ?? DEFAULT_CACHE_KEY_SUPPLIER;
    this.cache = new FixedSizeExpiringCache<HookStagesEntry>({
      maxItems: options.maxCacheItems,
      ttlMs: options.debounceTime,
    });
  }

  before(hookContext: HookContext<T>, hookHints?: HookHints) {
    return this.maybeSkipAndCache(
      'before',
      () => this.cacheKeySupplier?.(hookContext.flagKey, hookContext.context),
      () => this.innerHook?.before?.(hookContext, hookHints),
    );
  }

  after(hookContext: HookContext<T>, evaluationDetails: EvaluationDetails<T>, hookHints?: HookHints) {
    return this.maybeSkipAndCache(
      'after',
      () => this.cacheKeySupplier?.(hookContext.flagKey, hookContext.context),
      () => this.innerHook?.after?.(hookContext, evaluationDetails, hookHints),
    );
  }

  error(hookContext: HookContext<T>, err: unknown, hookHints?: HookHints) {
    return this.maybeSkipAndCache(
      'error',
      () => this.cacheKeySupplier?.(hookContext.flagKey, hookContext.context),
      () => this.innerHook?.error?.(hookContext, err, hookHints),
    );
  }

  finally(hookContext: HookContext<T>, evaluationDetails: EvaluationDetails<T>, hookHints?: HookHints) {
    return this.maybeSkipAndCache(
      'finally',
      () => this.cacheKeySupplier?.(hookContext.flagKey, hookContext.context),
      () => this.innerHook?.finally?.(hookContext, evaluationDetails, hookHints),
    );
  }

  private maybeSkipAndCache(
    stage: Stage,
    keyGenCallback: () => string | null | undefined,
    hookCallback: () => Promise<EvaluationContext | void> | EvaluationContext | void,
  ) {
    // the cache key is a concatenation of the result of calling keyGenCallback and the stage
    let dynamicKey: string | null | undefined;

    try {
      dynamicKey = keyGenCallback();
    } catch (e) {
      // if the keyGenCallback throws, we log and run the hook stage
      this.options.logger?.error(
        `DebounceHook: cacheKeySupplier threw an error, running inner hook stage "${stage}" without debouncing.`,
        e,
      );
    }

    // if the keyGenCallback returns nothing, we don't do any caching
    if (!dynamicKey) {
      return hookCallback.call(this.innerHook);
    }

    const cacheKey = `${dynamicKey}::cache-key`;
    const got = this.cache.get(cacheKey);

    if (got) {
      const cachedStageResult = got[stage];
      // throw cached errors
      if (cachedStageResult instanceof CachedError) {
        throw cachedStageResult;
      }
      if (cachedStageResult) {
        // already ran this stage for this key and is still in the debounce period
        if (typeof cachedStageResult === 'object') {
          // we have a cached context to return
          return cachedStageResult;
        }
        return;
      }
    }

    // we have to be pretty careful here to support both web and server hooks;
    // server hooks can be async, web hooks can't, we have to handle both cases.
    try {
      const maybePromiseOrContext = hookCallback.call(this.innerHook);
      if (maybePromiseOrContext && typeof maybePromiseOrContext.then === 'function') {
        // async hook result; cache after promise resolves
        maybePromiseOrContext
          .then((maybeContext) => {
            this.cacheSuccess(cacheKey, stage, got, maybeContext);
            return maybeContext;
          })
          .catch((error) => {
            this.cacheError(cacheKey, stage, got, error);
            throw error;
          });
      } else {
        // sync hook result; cache now
        this.cacheSuccess(cacheKey, stage, got, maybePromiseOrContext as void | EvaluationContext);
      }
      return maybePromiseOrContext;
    } catch (error: unknown) {
      this.cacheError(cacheKey, stage, got, error);
      throw error;
    }
  }

  private cacheSuccess(
    key: string,
    stage: Stage,
    cached: HookStagesEntry | undefined,
    maybeContext: EvaluationContext | void,
  ): void {
    this.cache.set(key, { ...cached, [stage]: maybeContext || true });
  }

  private cacheError(key: string, stage: Stage, cached: HookStagesEntry | undefined, error: unknown): void {
    if (this.cacheErrors) {
      this.cache.set(key, { ...cached, [stage]: new CachedError(error) });
    }
  }
}
