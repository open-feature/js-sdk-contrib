import type {
  EvaluationContext,
  EvaluationDetails,
  FlagValue,
  Hook,
  HookContext,
  HookHints,
} from '@openfeature/web-sdk';
import { FixedSizeExpiringCache } from './utils/fixed-size-expiring-cache';

/**
 * An error cached from a previous hook invocation.
 */
export class CachedError extends Error {
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
}

export type Options<T extends FlagValue = FlagValue> = {
  /**
   * Function to generate the cache key for the before stage of the wrapped hook.
   * If the cache key is found in the cache, the hook stage will not run.
   * If not defined, the DebounceHook will no-op for this stage (inner hook will always run for this stage).
   *
   * @param flagKey the flag key
   * @param context the evaluation context
   * @returns cache key for this stage
   */
  beforeCacheKeySupplier?: (flagKey: string, context: EvaluationContext) => string | null | undefined;
  /**
   * Function to generate the cache key for the after stage of the wrapped hook.
   * If the cache key is found in the cache, the hook stage will not run.
   * If not defined, the DebounceHook will no-op for this stage (inner hook will always run for this stage).
   *
   * @param flagKey the flag key
   * @param context the evaluation context
   * @param details the evaluation details
   * @returns cache key for this stage
   */
  afterCacheKeySupplier?: (
    flagKey: string,
    context: EvaluationContext,
    details: EvaluationDetails<T>,
  ) => string | null | undefined;
  /**
   * Function to generate the cache key for the error stage of the wrapped hook.
   * If the cache key is found in the cache, the hook stage will not run.
   * If not defined, the DebounceHook will no-op for this stage (inner hook will always run for this stage).
   *
   * @param flagKey the flag key
   * @param context the evaluation context
   * @param err the Error
   * @returns cache key for this stage
   */
  errorCacheKeySupplier?: (flagKey: string, context: EvaluationContext, err: unknown) => string | null | undefined;
  /**
   * Function to generate the cache key for the error stage of the wrapped hook.
   * If the cache key is found in the cache, the hook stage will not run.
   * If not defined, the DebounceHook will no-op for this stage (inner hook will always run for this stage).
   *
   * @param flagKey the flag key
   * @param context the evaluation context
   * @param details the evaluation details
   * @returns cache key for this stage
   */
  finallyCacheKeySupplier?: (
    flagKey: string,
    context: EvaluationContext,
    details: EvaluationDetails<T>,
  ) => string | null | undefined;
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
};

/**
 * A hook that wraps another hook and debounces its execution based on the provided options.
 * Each stage of the hook (before, after, error, finally) is debounced independently.
 * If a stage is called with a cache key that has been seen within the debounce time, the inner hook's stage will not run.
 * If no cache key supplier is provided for a stage, that stage will always run.
 */
export class DebounceHook<T extends FlagValue = FlagValue> implements Hook {
  private readonly cache: FixedSizeExpiringCache<true | CachedError>;
  private readonly cacheErrors: boolean;

  public constructor(
    private readonly innerHook: Hook,
    private readonly options: Options<T>,
  ) {
    this.cacheErrors = options.cacheErrors || false;
    this.cache = new FixedSizeExpiringCache<true | CachedError>({
      maxItems: options.maxCacheItems,
      ttlMs: options.debounceTime,
    });
  }

  before(hookContext: HookContext, hookHints?: HookHints) {
    this.maybeSkipAndCache(
      'before',
      () => this.options?.beforeCacheKeySupplier?.(hookContext.flagKey, hookContext.context),
      () => this.innerHook?.before?.(hookContext, hookHints),
    );
  }

  after(hookContext: HookContext, evaluationDetails: EvaluationDetails<T>, hookHints?: HookHints) {
    this.maybeSkipAndCache(
      'after',
      () => this.options?.afterCacheKeySupplier?.(hookContext.flagKey, hookContext.context, evaluationDetails),
      () => this.innerHook?.after?.(hookContext, evaluationDetails, hookHints),
    );
  }

  error(hookContext: HookContext, err: unknown, hookHints?: HookHints) {
    this.maybeSkipAndCache(
      'error',
      () => this.options?.errorCacheKeySupplier?.(hookContext.flagKey, hookContext.context, err),
      () => this.innerHook?.error?.(hookContext, err, hookHints),
    );
  }

  finally(hookContext: HookContext, evaluationDetails: EvaluationDetails<T>, hookHints?: HookHints) {
    this.maybeSkipAndCache(
      'finally',
      () => this.options?.finallyCacheKeySupplier?.(hookContext.flagKey, hookContext.context, evaluationDetails),
      () => this.innerHook?.finally?.(hookContext, evaluationDetails, hookHints),
    );
  }

  private maybeSkipAndCache(
    stage: 'before' | 'after' | 'error' | 'finally',
    keyGenCallback: () => string | null | undefined,
    hookCallback: () => void,
  ) {
    // the cache key is a concatenation of the result of calling keyGenCallback and the stage
    const dynamicKey = keyGenCallback();

    // if the keyGenCallback returns nothing, we don't do any caching
    if (dynamicKey) {
      const cacheKeySuffix = stage;
      const cacheKey = `${dynamicKey}::${cacheKeySuffix}`;
      const got = this.cache.get(cacheKey);

      if (got) {
        // throw cached errors
        if (got instanceof CachedError) {
          throw got;
        }
        return;
      } else {
        try {
          hookCallback();
          this.cache.set(cacheKey, true);
        } catch (error: unknown) {
          if (this.cacheErrors) {
            // cache error
            this.cache.set(cacheKey, new CachedError(error));
          }
          throw error;
        }
        return;
      }
    } else {
      hookCallback();
    }
  }
}
