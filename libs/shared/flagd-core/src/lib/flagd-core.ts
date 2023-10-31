import {MemoryStorage, Storage} from './storage';
import {
  EvaluationContext,
  FlagNotFoundError,
  FlagValue,
  JsonValue,
  ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/core';
import {Targeting} from "./targeting/targeting";

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
  ): ResolutionDetails<boolean> {
    return this.resolve(flagKey, defaultValue, evalCtx, (v) => {
      return typeof v === 'boolean';
    });
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    evalCtx: EvaluationContext,
  ): ResolutionDetails<string> {
    return this.resolve(flagKey, defaultValue, evalCtx, (v) => {
      return typeof v === 'string';
    });
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    evalCtx: EvaluationContext,
  ): ResolutionDetails<number> {
    return this.resolve(flagKey, defaultValue, evalCtx, (v) => {
      return typeof v === 'number';
    });
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    evalCtx: EvaluationContext,
  ): ResolutionDetails<T> {
    return this.resolve(flagKey, defaultValue, evalCtx, (v) => {
      return typeof v === 'object';
    });
  }

  private resolve<T extends FlagValue>(
    flagKey: string,
    defaultValue: T,
    evalCtx: EvaluationContext,
    guard: (a: FlagValue) => boolean,
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
      }
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
        console.error(`Error evaluating targeting rule for flag ${flagKey}, falling back to default`, e);
        targetingResolution = null;
      }

      if (!targetingResolution) {
        variant = flag.defaultVariant;
        reason = StandardResolutionReasons.DEFAULT;
      } else {
        variant = targetingResolution;
        reason = StandardResolutionReasons.TARGETING_MATCH;
      }
    }

    if (typeof variant !== 'string') {
      throw new TypeMismatchError('Variant must be a string, but found ' + typeof variant)
    }

    const resolvedVariant = flag.variants.get(variant)
    if (!resolvedVariant) {
      throw new TypeMismatchError(`Variant ${variant} not found in flag with key ${flagKey}`);
    }

    if (!guard(resolvedVariant)) {
      throw new TypeMismatchError('Evaluated type does not match the flag type');
    }

    return {
      value: resolvedVariant as T,
      reason: reason,
      variant,
    };
  }
}
