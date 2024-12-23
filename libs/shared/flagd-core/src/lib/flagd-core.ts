import {
  DefaultLogger,
  ErrorCode,
  EvaluationContext,
  EvaluationDetails,
  FlagValue,
  FlagValueType,
  JsonValue,
  Logger,
  ResolutionDetails,
  SafeLogger,
  StandardResolutionReasons,
} from '@openfeature/core';
import { FeatureFlag } from './feature-flag';
import { MemoryStorage, Storage } from './storage';

type ResolutionDetailsWithFlagMetadata<T> = Required<Pick<ResolutionDetails<T>, 'flagMetadata'>> & ResolutionDetails<T>;

/**
 * Expose flag configuration setter and flag resolving methods.
 */
export class FlagdCore implements Storage {
  private _logger: Logger;
  private _storage: Storage;

  constructor(storage?: Storage, logger?: Logger) {
    this._logger = logger ? new SafeLogger(logger) : new DefaultLogger();
    this._storage = storage ? storage : new MemoryStorage(this._logger);
  }

  setConfigurations(cfg: string): string[] {
    return this._storage.setConfigurations(cfg);
  }

  getFlag(key: string): FeatureFlag | undefined {
    return this._storage.getFlag(key);
  }

  getFlags(): Map<string, FeatureFlag> {
    return this._storage.getFlags();
  }

  getFlagSetMetadata(): { flagSetId?: string; flagSetVersion?: string } {
    return this._storage.getFlagSetMetadata();
  }

  /**
   * Resolve the flag evaluation to a boolean value.
   * @param flagKey - The key of the flag to be evaluated.
   * @param defaultValue - The default value to be returned if the flag is not found.
   * @param evalCtx - The evaluation context to be used for targeting.
   * @returns - The resolved value and the reason for the resolution.
   */
  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    evalCtx?: EvaluationContext,
  ): ResolutionDetailsWithFlagMetadata<boolean> {
    return this.resolve('boolean', flagKey, defaultValue, evalCtx);
  }

  /**
   * Resolve the flag evaluation to a string value.
   * @param flagKey - The key of the flag to be evaluated.
   * @param defaultValue - The default value to be returned if the flag is not found.
   * @param evalCtx - The evaluation context to be used for targeting.
   * @returns - The resolved value and the reason for the resolution.
   */
  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    evalCtx?: EvaluationContext,
  ): ResolutionDetailsWithFlagMetadata<string> {
    return this.resolve('string', flagKey, defaultValue, evalCtx);
  }

  /**
   * Resolve the flag evaluation to a numeric value.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found or the evaluation fails.
   * @param evalCtx - The evaluation context to be used for targeting.
   * @returns - The resolved value and the reason for the resolution.
   */
  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    evalCtx?: EvaluationContext,
  ): ResolutionDetailsWithFlagMetadata<number> {
    return this.resolve('number', flagKey, defaultValue, evalCtx);
  }

  /**
   * Resolve the flag evaluation to an object value.
   * @template T - The type of the return value.
   * @param flagKey - The key of the flag to resolve.
   * @param defaultValue - The default value to use if the flag is not found.
   * @param evalCtx - The evaluation context to be used for targeting.
   * @returns - The resolved value and the reason for the resolution.
   */
  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    evalCtx?: EvaluationContext,
  ): ResolutionDetailsWithFlagMetadata<T> {
    return this.resolve('object', flagKey, defaultValue, evalCtx);
  }

  /**
   * Resolve the flag evaluation for all enabled flags.
   * @param evalCtx - The evaluation context to be used for targeting.
   * @returns - The list of evaluation details for all enabled flags.
   */
  resolveAll(evalCtx: EvaluationContext = {}): EvaluationDetails<JsonValue>[] {
    const values: EvaluationDetails<JsonValue>[] = [];
    for (const [key, flag] of this.getFlags()) {
      try {
        if (flag.state === 'DISABLED') {
          continue;
        }
        const result = flag.evaluate(evalCtx);
        values.push({
          ...result,
          flagKey: key,
          flagMetadata: Object.freeze(result.flagMetadata ?? {}),
        });
      } catch (e) {
        this._logger.error(`Error resolving flag ${key}: ${(e as Error).message}`);
      }
    }
    return values;
  }

  /**
   * Resolves the value of a flag based on the specified type.
   * @template T - The type of the flag value.
   * @param {FlagValueType} type - The type of the flag value.
   * @param {string} flagKey - The key of the flag.
   * @param {T} defaultValue - The default value of the flag.
   * @param {EvaluationContext} evalCtx - The evaluation context for targeting rules.
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
  ): ResolutionDetailsWithFlagMetadata<T> {
    const flag = this._storage.getFlag(flagKey);
    // flag exist check
    if (!flag) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: `flag '${flagKey}' not found`,
        flagMetadata: this._storage.getFlagSetMetadata(),
      };
    }

    // flag status check
    if (flag.state === 'DISABLED') {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: `flag '${flagKey}' is disabled`,
        flagMetadata: flag.metadata,
      };
    }

    const { value, reason, variant } = flag.evaluate(evalCtx);

    if (typeof value !== type) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: `Evaluated type of the flag ${flagKey} does not match. Expected ${type}, got ${typeof value}`,
        flagMetadata: flag.metadata,
      };
    }

    return {
      value: value as T,
      reason,
      variant,
      flagMetadata: flag.metadata,
    };
  }
}
