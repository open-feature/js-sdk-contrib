import { MemoryStorage, Storage } from './storage';
import {
  EvaluationContext,
  FlagNotFoundError,
  FlagValue,
  GeneralError,
  JsonValue,
  ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/core';
import { Targeting } from './targeting/targeting';
import { Logger } from '@openfeature/server-sdk';

/**
 * Expose flag configuration setter and flag resolving methods.
 */
export class FlagdCore {
  private _storage: Storage;
  private _targeting = new Targeting();

  /**
   * Optionally construct with your own storage layer.
   */
  constructor(storage?: Storage) {
    this._storage = storage ? storage : new MemoryStorage();
  }

  /**
   * Add flag configurations to the storage.
   */
  setConfigurations(cfg: string): void {
    this._storage.setConfigurations(cfg);
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    evalCtx: EvaluationContext,
    logger: Logger,
  ): ResolutionDetails<boolean> {
    return this.resolve(flagKey, defaultValue, evalCtx, logger, 'boolean');
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    evalCtx: EvaluationContext,
    logger: Logger,
  ): ResolutionDetails<string> {
    return this.resolve(flagKey, defaultValue, evalCtx, logger, 'string');
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    evalCtx: EvaluationContext,
    logger: Logger,
  ): ResolutionDetails<number> {
    return this.resolve(flagKey, defaultValue, evalCtx, logger, 'number');
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    evalCtx: EvaluationContext,
    logger: Logger,
  ): ResolutionDetails<T> {
    return this.resolve(flagKey, defaultValue, evalCtx, logger, 'object');
  }

  private resolve<T extends FlagValue>(
    flagKey: string,
    defaultValue: T,
    evalCtx: EvaluationContext,
    logger: Logger,
    type: string,
  ): ResolutionDetails<T> {
    // flag exist check
    const flag = this._storage.getFlag(flagKey);
    if (!flag) {
      throw new FlagNotFoundError(`flag: ${flagKey} not found`);
    }

    // flag status check
    if (flag.state === 'DISABLED') {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DISABLED,
      };
    }

    let variant;
    let reason;

    if (!flag.targeting) {
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
