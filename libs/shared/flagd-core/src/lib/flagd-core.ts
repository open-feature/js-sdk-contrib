import { DefaultLogger, ErrorCode, SafeLogger, StandardResolutionReasons } from '@openfeature/core';
import type {
  ResolutionDetails,
  Logger,
  EvaluationContext,
  EvaluationDetails,
  FlagValue,
  FlagValueType,
  JsonValue,
  FlagMetadata,
} from '@openfeature/core';
import type { FeatureFlag } from './feature-flag';
import type { Storage } from './storage';
import { MemoryStorage } from './storage';

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

  setConfigurations(flagConfig: string): string[] {
    return this._storage.setConfigurations(flagConfig);
  }

  getFlag(key: string): FeatureFlag | undefined {
    return this._storage.getFlag(key);
  }

  getFlags(): Map<string, FeatureFlag> {
    return this._storage.getFlags();
  }

  getFlagSetMetadata(): FlagMetadata {
    return this._storage.getFlagSetMetadata();
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
    logger: Logger = this._logger,
  ): ResolutionDetailsWithFlagMetadata<boolean> {
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
    logger: Logger = this._logger,
  ): ResolutionDetailsWithFlagMetadata<string> {
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
    logger: Logger = this._logger,
  ): ResolutionDetailsWithFlagMetadata<number> {
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
    logger: Logger = this._logger,
  ): ResolutionDetailsWithFlagMetadata<T> {
    return this.resolve('object', flagKey, defaultValue, evalCtx, logger);
  }

  /**
   * Resolve the flag evaluation for all enabled flags.
   * @param evalCtx - The evaluation context to be used for targeting.
   * @param logger - The logger to be used to troubleshoot targeting errors. Overrides the default logger.
   * @returns - The list of evaluation details for all enabled flags.
   */
  resolveAll(evalCtx: EvaluationContext = {}, logger: Logger = this._logger): EvaluationDetails<JsonValue>[] {
    const values: EvaluationDetails<JsonValue>[] = [];
    for (const [key, flag] of this.getFlags()) {
      try {
        if (flag.state === 'DISABLED') {
          continue;
        }
        const result = flag.evaluate(evalCtx, logger);

        if (result.value !== undefined) {
          values.push({
            ...result,
            flagKey: key,
          });
        } else {
          logger.debug(`Flag ${key} omitted because ${result.errorCode}: ${result.errorMessage}`);
        }
      } catch (e) {
        logger.debug(`Error resolving flag ${key}: ${(e as Error).message}`);
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
   * @param {Logger} logger - The logger to be used to troubleshoot targeting errors. Overrides the default logger.
   * @returns {ResolutionDetailsWithFlagMetadata<T>} -  The resolved value and the reason for the resolution.
   */
  resolve<T extends FlagValue>(
    type: FlagValueType,
    flagKey: string,
    defaultValue: T,
    evalCtx: EvaluationContext = {},
    logger: Logger = this._logger,
  ): ResolutionDetailsWithFlagMetadata<T> {
    const flag = this._storage.getFlag(flagKey);

    if (!flag) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: `flag '${flagKey}' not found`,
        flagMetadata: this._storage.getFlagSetMetadata(),
      };
    }

    if (flag.state === 'DISABLED') {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: `flag '${flagKey}' is disabled`,
        flagMetadata: flag.metadata,
      };
    }

    const resolution = flag.evaluate(evalCtx, logger);

    /**
     * A resolution without a value represents an error condition. It contains
     * information about the error but requires the default value set.
     */
    if (resolution.value === undefined) {
      return {
        ...resolution,
        value: defaultValue,
      };
    }

    if (typeof resolution.value !== type) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: `Evaluated type of the flag ${flagKey} does not match. Expected ${type}, got ${typeof resolution.value}`,
        flagMetadata: flag.metadata,
      };
    }

    return {
      ...resolution,
      value: resolution.value as T,
    };
  }
}
