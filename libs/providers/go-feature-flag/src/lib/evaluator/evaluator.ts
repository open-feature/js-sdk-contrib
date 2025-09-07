import type { EvaluationContext, JsonValue, ResolutionDetails } from '@openfeature/server-sdk';

/**
 * IEvaluator is an interface that represents the evaluation of a feature flag.
 * It can have multiple implementations: Remote or InProcess.
 */
export interface IEvaluator {
  /**
   * Initialize the evaluator.
   */
  initialize(): Promise<void>;

  /**
   * Evaluates a boolean flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  evaluateBoolean(
    flagKey: string,
    defaultValue: boolean,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>>;
  /**
   * Evaluates a string flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  evaluateString(
    flagKey: string,
    defaultValue: string,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<string>>;
  /**
   * Evaluates a number flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  evaluateNumber(
    flagKey: string,
    defaultValue: number,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<number>>;

  /**
   * Evaluates an object flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  evaluateObject<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<T>>;

  /**
   * Check if the flag is trackable.
   */
  isFlagTrackable(flagKey: string): boolean;

  /**
   * Dispose the evaluator.
   */
  dispose(): Promise<void>;
}
