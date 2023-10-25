import {Storage, MemoryStorage} from './storage';
import {
  ErrorCode,
  EvaluationContext,
  FlagValue,
  JsonValue,
  ResolutionDetails,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';

/**
 * Expose flag configuration setter and flag resolving methods.
 */
export class FlagdJSCore {
  private _storage: Storage;

  /**
   * Construct with optional your own storage layer.
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
    transformedContext: EvaluationContext,
  ): ResolutionDetails<boolean> {
    return this.resolve(flagKey, defaultValue, transformedContext, (v) => {
      return typeof v == 'boolean';
    });
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    transformedContext: EvaluationContext,
  ): ResolutionDetails<string> {
    return this.resolve(flagKey, defaultValue, transformedContext, (v) => {
      return typeof v == 'string';
    });
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    transformedContext: EvaluationContext,
  ): ResolutionDetails<number> {
    return this.resolve(flagKey, defaultValue, transformedContext, (v) => {
      return typeof v == 'number';
    });
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    transformedContext: EvaluationContext,
  ): ResolutionDetails<T> {
    return this.resolve(flagKey, defaultValue, transformedContext, (v) => {
      return typeof v == 'object';
    });
  }

  private resolve<T extends FlagValue>(
    flagKey: string,
    defaultValue: T,
    transformedContext: EvaluationContext,
    guard: (a: FlagValue) => boolean,
  ): ResolutionDetails<T> {
    // flag exist
    const flag = this._storage.getFlag(flagKey);
    if (flag === undefined) {
      return {
        value: defaultValue,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: `flag: ${flagKey} not found`,
        reason: StandardResolutionReasons.ERROR,
      };
    }

    // flag status
    if (flag.state === 'DISABLED') {
      return {
        value: defaultValue,
        errorCode: ErrorCode.GENERAL,
        errorMessage: `flag: ${flagKey} is disabled`,
        reason: StandardResolutionReasons.DISABLED,
      };
    }

    const defaultVariant = flag.defaultVariant;

    let variant;
    let reason;

    if (flag.targetingString == undefined) {
      variant = flag.variants.get(defaultVariant);
      reason = StandardResolutionReasons.STATIC;
    } else {
      // todo - targeting evaluation
      // till targeting is handled, return the static result
      variant = flag.variants.get(defaultVariant);
      reason = StandardResolutionReasons.STATIC;
    }

    if (variant === undefined) {
      return {
        value: defaultValue,
        errorCode: ErrorCode.GENERAL,
        errorMessage: `variant ${defaultVariant} not found in flag with key ${flagKey}`,
        reason: StandardResolutionReasons.ERROR,
      };
    }

    if (!guard(variant)) {
      return {
        value: defaultValue,
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: `returning default variant for flagKey: ${flagKey}, type not valid`,
        reason: StandardResolutionReasons.ERROR,
      };
    }

    return {
      value: variant as T,
      reason: reason,
    };
  }
}
