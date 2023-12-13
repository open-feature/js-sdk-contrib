import { MemoryStorage, Storage } from './storage';
import {
  EvaluationContext,
  FlagNotFoundError,
  FlagValue,
  GeneralError,
  JsonValue,
  FlagValueType,
  ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError,
  Logger,
  SafeLogger,
  DefaultLogger,
} from '@openfeature/core';
import { Targeting } from './targeting/targeting';
import { FeatureFlag } from './feature-flag';

/**
 * Expose flag configuration setter and flag resolving methods.
 */
export class FlagdCore implements Storage {
  private _logger: Logger;
  private _storage: Storage;
  private _targeting: Targeting;

  constructor(storage?: Storage, logger?: Logger) {
    this._storage = storage ? storage : new MemoryStorage();
    this._logger = logger ? new SafeLogger(logger) : new DefaultLogger();
    this._targeting = new Targeting(this._logger);
  }

  /**
   * Sets the logger for the FlagdCore instance.
   * @param logger - The logger to be set.
   * @returns - The FlagdCore instance with the logger set.
   */
  setLogger(logger: Logger) {
    this._logger = new SafeLogger(logger);
    return this;
  }

  setConfigurations(cfg: string): void {
    this._storage.setConfigurations(cfg);
  }

  getFlag(key: string): FeatureFlag | undefined {
    return this._storage.getFlag(key);
  }

  getFlags(): Map<string, FeatureFlag> {
    return this._storage.getFlags();
  }

  /**
   * Resolve the flag evaluation to a boolean value.
   * @param flagKey - The key of the flag to be evaluated.
   * @param defaultValue - The default value to be returned if the flag is not found.
   * @param evalCtx - The evaluation context to be used for targeting.
   * @param logger - The logger to be used to troubleshoot targeting errors. Overrides the default logger.
   * @returns - The resolved value and the reason for the resolution.
   */
  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    evalCtx?: EvaluationContext,
    logger?: Logger,
  ): ResolutionDetails<boolean> {
    return this.resolve('boolean', flagKey, defaultValue, evalCtx, logger);
  }

  /**
   * Resolve the flag evaluation to a string value.
   * @param flagKey - The key of the flag to be evaluated.
   * @param defaultValue - The default value to be returned if the flag is not found.
   * @param evalCtx - The evaluation context to be used for targeting.
   * @param logger - The logger to be used to troubleshoot targeting errors. Overrides the default logger.
   * @returns - The resolved value and the reason for the resolution.
   */
  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    evalCtx?: EvaluationContext,
    logger?: Logger,
  ): ResolutionDetails<string> {
    return this.resolve('string', flagKey, defaultValue, evalCtx, logger);
  }

  /**
   * Resolve the flag evaluation to a numeric value.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found or the evaluation fails.
   * @param evalCtx - The evaluation context to be used for targeting.
   * @param logger - The logger to be used to troubleshoot targeting errors. Overrides the default logger.
   * @returns - The resolved value and the reason for the resolution.
   */
  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    evalCtx?: EvaluationContext,
    logger?: Logger,
  ): ResolutionDetails<number> {
    return this.resolve('number', flagKey, defaultValue, evalCtx, logger);
  }

  /**
   * Resolve the flag evaluation to an object value.
   * @template T - The type of the return value.
   * @param flagKey - The key of the flag to resolve.
   * @param defaultValue - The default value to use if the flag is not found.
   * @param evalCtx - The evaluation context to be used for targeting.
   * @param logger - The logger to be used to troubleshoot targeting errors. Overrides the default logger.
   * @returns - The resolved value and the reason for the resolution.
   */
  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    evalCtx?: EvaluationContext,
    logger?: Logger,
  ): ResolutionDetails<T> {
    return this.resolve('object', flagKey, defaultValue, evalCtx, logger);
  }

  /**
   * Resolves the value of a flag based on the specified type type.
   * @template T - The type of the flag value.
   * @param {FlagValueType} type - The type of the flag value.
   * @param {string} flagKey - The key of the flag.
   * @param {T} defaultValue - The default value of the flag.
   * @param {EvaluationContext} evalCtx - The evaluation context for targeting rules.
   * @param {Logger} [logger] - The optional logger for logging errors.
   * @returns {ResolutionDetails<T>} -  The resolved value and the reason for the resolution.
   * @throws {FlagNotFoundError} - If the flag with the given key is not found.
   * @throws {TypeMismatchError} - If the evaluated type of the flag does not match the expected type.
   * @throws {GeneralError} - If the variant specified in the flag is not found.
   */
  resolve<T extends FlagValue>(
    type: FlagValueType,
    flagKey: string,
    defaultValue: T,
    evalCtx: EvaluationContext = {},
    logger?: Logger,
  ): ResolutionDetails<T> {
    logger ??= this._logger;
    const flag = this._storage.getFlag(flagKey);
    // flag exist check
    if (!flag) {
      throw new FlagNotFoundError(`flag: '${flagKey}' not found`);
    }

    // flag status check
    if (flag.state === 'DISABLED') {
      logger.debug(`Flag ${flagKey} is disabled, returning default value ${defaultValue}`);
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DISABLED,
      };
    }

    let variant;
    let reason;

    if (!flag.targeting) {
      logger.debug(`Flag ${flagKey} has no targeting rules`);
      variant = flag.defaultVariant;
      reason = StandardResolutionReasons.STATIC;
    } else {
      let targetingResolution;
      try {
        targetingResolution = this._targeting.applyTargeting(flagKey, flag.targeting, evalCtx);
      } catch (e) {
        logger.error(`Error evaluating targeting rule for flag ${flagKey}, falling back to default`, e);
        targetingResolution = null;
      }

      if (!targetingResolution) {
        variant = flag.defaultVariant;
        reason = StandardResolutionReasons.DEFAULT;
      } else {
        // Obtain resolution in string. This is useful for short-circuiting json logic
        variant = targetingResolution.toString();
        reason = StandardResolutionReasons.TARGETING_MATCH;
      }
    }

    if (typeof variant !== 'string') {
      throw new TypeMismatchError('Variant must be a string, but found ' + typeof variant);
    }

    const resolvedVariant = flag.variants.get(variant);
    if (resolvedVariant === undefined) {
      throw new GeneralError(`Variant ${variant} not found in flag with key ${flagKey}`);
    }

    if (typeof resolvedVariant !== type) {
      throw new TypeMismatchError(
        `Evaluated type of the flag ${flagKey} does not match. Expected ${type}, got ${typeof resolvedVariant}`,
      );
    }

    return {
      value: resolvedVariant as T,
      reason,
      variant,
    };
  }
}
