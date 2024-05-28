import {
  BaseEvaluationStrategy,
  FinalResult,
  ProviderResolutionResult,
  StrategyPerProviderContext,
} from './BaseEvaluationStrategy';
import { ErrorCode, EvaluationContext, FlagValue, ResolutionDetails } from '@openfeature/server-sdk';

/**
 * Return the first result that did not indicate "flag not found".
 * If any provider in the course of evaluation returns or throws an error, throw that error
 */
export class FirstMatchStrategy extends BaseEvaluationStrategy {
  override shouldEvaluateNextProvider<T extends FlagValue>(
    strategyContext: StrategyPerProviderContext,
    context: EvaluationContext,
    details?: ResolutionDetails<T>,
    thrownError?: unknown,
  ): boolean {
    if (details?.errorCode === ErrorCode.FLAG_NOT_FOUND) {
      return true;
    }
    if (details?.errorCode) {
      return false;
    }
    return false;
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
