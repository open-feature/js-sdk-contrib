import type { EvaluationContext, JsonValue, Logger, ResolutionDetails } from '@openfeature/core';
import type { IEvaluator } from './evaluator';
import { OFREPProvider, type OFREPProviderOptions } from '@openfeature/ofrep-provider';
import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import { isomorphicFetch } from '../helper/fetch-api';

export class RemoteEvaluator implements IEvaluator {
  /**
   * The OFREP provider
   */
  private readonly ofrepProvider: OFREPProvider;
  /**
   * The logger to use.
   */
  private readonly logger?: Logger;

  constructor(options: GoFeatureFlagProviderOptions, logger?: Logger) {
    this.logger = logger;
    const ofrepOptions: OFREPProviderOptions = {
      baseUrl: options.endpoint,
      timeoutMs: options.timeout,
      fetchImplementation: options.fetchImplementation ?? isomorphicFetch(),
    };
    ofrepOptions.headers = [['Content-Type', 'application/json']];
    if (options.apiKey) {
      ofrepOptions.headers.push(['Authorization', `Bearer ${options.apiKey}`]);
    }
    this.ofrepProvider = new OFREPProvider(ofrepOptions);
  }

  /**
   * Evaluates a boolean flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  async evaluateBoolean(
    flagKey: string,
    defaultValue: boolean,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.ofrepProvider.resolveBooleanEvaluation(flagKey, defaultValue, evaluationContext ?? {});
  }

  /**
   * Evaluates a string flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  async evaluateString(
    flagKey: string,
    defaultValue: string,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.ofrepProvider.resolveStringEvaluation(flagKey, defaultValue, evaluationContext ?? {});
  }

  /**
   * Evaluates a number flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  async evaluateNumber(
    flagKey: string,
    defaultValue: number,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.ofrepProvider.resolveNumberEvaluation(flagKey, defaultValue, evaluationContext ?? {});
  }

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
  ): Promise<ResolutionDetails<T>> {
    return this.ofrepProvider.resolveObjectEvaluation(flagKey, defaultValue, evaluationContext ?? {});
  }

  /**
   * Checks if the flag is trackable.
   * @param _flagKey - The key of the flag to check.
   * @returns True if the flag is trackable, false otherwise.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isFlagTrackable(_flagKey: string): boolean {
    return false;
  }

  /**
   * Disposes the evaluator.
   * @returns A promise that resolves when the evaluator is disposed.
   */
  dispose(): Promise<void> {
    this.logger?.info('Disposing Remote evaluator');
    return Promise.resolve();
  }

  /**
   * Initializes the evaluator.
   * @returns A promise that resolves when the evaluator is initialized.
   */
  async initialize(): Promise<void> {
    this.logger?.info('Initializing Remote evaluator');
    return Promise.resolve();
  }
}
