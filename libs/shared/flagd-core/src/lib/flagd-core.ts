import {MemoryStorage, Storage} from './storage';
import {
  EvaluationContext,
  FlagNotFoundError,
  FlagValue,
  JsonValue,
  ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/server-sdk';

/**
 * Expose flag configuration setter and flag resolving methods.
 */
export class FlagdCore {
  private _storage: Storage;

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
      return typeof v == 'boolean';
    });
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    evalCtx: EvaluationContext,
  ): ResolutionDetails<string> {
    return this.resolve(flagKey, defaultValue, evalCtx, (v) => {
      return typeof v == 'string';
    });
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    evalCtx: EvaluationContext,
  ): ResolutionDetails<number> {
    return this.resolve(flagKey, defaultValue, evalCtx, (v) => {
      return typeof v == 'number';
    });
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    evalCtx: EvaluationContext,
  ): ResolutionDetails<T> {
    return this.resolve(flagKey, defaultValue, evalCtx, (v) => {
      return typeof v == 'object';
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
    if (flag === undefined) {
      throw new FlagNotFoundError(`flag: ${flagKey} not found`);
    }

    // flag status check
    if (flag.state === 'DISABLED') {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DISABLED,
      }
    }

    const defaultVariant = flag.defaultVariant;

    let resolvedVariant;
    let reason;

    if (flag.targetingString == undefined) {
      resolvedVariant = flag.variants.get(defaultVariant);
      reason = StandardResolutionReasons.STATIC;
    } else {
      // todo - targeting evaluation
      // till targeting is handled, return the static result
      resolvedVariant = flag.variants.get(defaultVariant);
      reason = StandardResolutionReasons.STATIC;
    }

    // todo improve this error condition when targeting evaluation is ready
    if (resolvedVariant === undefined) {
      throw new TypeMismatchError(`variant ${defaultVariant} not found in flag with key ${flagKey}`);
    }

    if (!guard(resolvedVariant)) {
      throw new TypeMismatchError('evaluated type does not match the flag type');
    }

    // todo check variant updates from targeting
    return {
      value: resolvedVariant as T,
      reason: reason,
      variant: defaultVariant
    };
  }
}
