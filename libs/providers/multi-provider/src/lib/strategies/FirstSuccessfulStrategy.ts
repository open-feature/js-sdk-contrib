import {
  BaseEvaluationStrategy,
  FinalResult,
  ProviderResolutionResult,
  StrategyPerProviderContext,
} from './BaseEvaluationStrategy';
import { EvaluationContext, FlagValue, ResolutionDetails } from '@openfeature/server-sdk';

/**
 * Return the first result that did result in an error
 * If any provider in the course of evaluation returns or throws an error, ignore it as long as there is a successful result
 * If there is no successful result, throw all errors
 */
export class FirstSuccessfulStrategy extends BaseEvaluationStrategy {
  override shouldEvaluateNextProvider<T extends FlagValue>(
    strategyContext: StrategyPerProviderContext,
    context: EvaluationContext,
    details?: ResolutionDetails<T>,
    thrownError?: unknown,
  ): boolean {
    // evaluate next only if there was an error
    return !!(thrownError || details?.errorCode);
  }

  override determineFinalResult<T extends FlagValue>(
    strategyContext: StrategyPerProviderContext,
    context: EvaluationContext,
    resolutions: ProviderResolutionResult<T>[],
  ): FinalResult<T> {
    const finalResolution = resolutions[resolutions.length - 1];
    if (this.hasError(finalResolution)) {
      return this.collectProviderErrors(resolutions);
    }
    return this.resolutionToFinalResult(finalResolution);
  }
}
