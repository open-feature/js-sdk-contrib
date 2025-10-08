import type { Logger } from '@openfeature/web-sdk';
import {
  ErrorCode,
  OpenFeatureError,
  type EvaluationContext,
  type EvaluationDetails,
  type FlagValue,
  type Hook,
  type HookContext,
  type HookHints,
} from '@openfeature/web-sdk';
import { FixedSizeExpiringCache } from './utils/fixed-size-expiring-cache';

const DEFAULT_CACHE_KEY_SUPPLIER = (flagKey: string) => flagKey;
type StageResult = true | CachedError;
type HookStagesEntry = { before?: StageResult; after?: StageResult; error?: StageResult; finally?: StageResult };

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
export class DebounceHook<T extends FlagValue = FlagValue> implements Hook {
  private readonly cache: FixedSizeExpiringCache<HookStagesEntry>;
  private readonly cacheErrors: boolean;
  private readonly cacheKeySupplier: Options['cacheKeySupplier'];

  public constructor(
    private readonly innerHook: Hook,
    private readonly options: Options,
  ) {
    this.cacheErrors = options.cacheErrors ?? false;
    this.cacheKeySupplier = options.cacheKeySupplier ?? DEFAULT_CACHE_KEY_SUPPLIER;
    this.cache = new FixedSizeExpiringCache<HookStagesEntry>({
      maxItems: options.maxCacheItems,
      ttlMs: options.debounceTime,
    });
  }

  before(hookContext: HookContext, hookHints?: HookHints) {
    this.maybeSkipAndCache(
      'before',
      () => this.cacheKeySupplier?.(hookContext.flagKey, hookContext.context),
      () => this.innerHook?.before?.(hookContext, hookHints),
    );
  }

  after(hookContext: HookContext, evaluationDetails: EvaluationDetails<T>, hookHints?: HookHints) {
    this.maybeSkipAndCache(
      'after',
      () => this.cacheKeySupplier?.(hookContext.flagKey, hookContext.context),
      () => this.innerHook?.after?.(hookContext, evaluationDetails, hookHints),
    );
  }

  error(hookContext: HookContext, err: unknown, hookHints?: HookHints) {
    this.maybeSkipAndCache(
      'error',
      () => this.cacheKeySupplier?.(hookContext.flagKey, hookContext.context),
      () => this.innerHook?.error?.(hookContext, err, hookHints),
    );
  }

  finally(hookContext: HookContext, evaluationDetails: EvaluationDetails<T>, hookHints?: HookHints) {
    this.maybeSkipAndCache(
      'finally',
      () => this.cacheKeySupplier?.(hookContext.flagKey, hookContext.context),
      () => this.innerHook?.finally?.(hookContext, evaluationDetails, hookHints),
    );
  }

  private maybeSkipAndCache(
    stage: 'before' | 'after' | 'error' | 'finally',
    keyGenCallback: () => string | null | undefined,
    hookCallback: () => void,
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
      hookCallback.call(this.innerHook);
      return;
    }

    const cacheKeySuffix = stage;
    const cacheKey = `${dynamicKey}::${cacheKeySuffix}`;
    const got = this.cache.get(cacheKey);

    if (got) {
      const cachedStageResult = got[stage];
      // throw cached errors
      if (cachedStageResult instanceof CachedError) {
        throw cachedStageResult;
      }
      if (cachedStageResult === true) {
        // already ran this stage for this key and is still in the debounce period
        return;
      }
    }

    try {
      hookCallback.call(this.innerHook);
      this.cache.set(cacheKey, { ...got, [stage]: true });
    } catch (error: unknown) {
      if (this.cacheErrors) {
        // cache error
        this.cache.set(cacheKey, { ...got, [stage]: new CachedError(error) });
      }
      throw error;
    }
  }
}
