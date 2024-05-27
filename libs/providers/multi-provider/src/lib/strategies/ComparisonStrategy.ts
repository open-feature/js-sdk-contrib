import {
  BaseEvaluationStrategy,
  FinalResult,
  ProviderResolutionResult,
  ProviderResolutionSuccessResult,
  StrategyPerProviderContext,
} from './BaseEvaluationStrategy';
import { EvaluationContext, FlagValue, Provider } from '@openfeature/server-sdk';

/**
 * Evaluate all providers in parallel and compare the results.
 * If the values agree, return the value
 * If the values disagree, return the value from the configured "fallback provider" and execute the "onMismatch"
 * callback if defined
 */
export class ComparisonStrategy extends BaseEvaluationStrategy {
  override runMode = 'parallel' as const;

  constructor(
    private fallbackProvider: Provider,
    private onMismatch?: (resolutions: ProviderResolutionResult<FlagValue>[]) => void,
  ) {
    super();
  }

  override determineFinalResult<T extends FlagValue>(
    strategyContext: StrategyPerProviderContext,
    context: EvaluationContext,
    resolutions: ProviderResolutionSuccessResult<T>[],
  ): FinalResult<T> {
    let value: T | undefined;
    let fallbackResolution: ProviderResolutionSuccessResult<T> | undefined;
    let mismatch = false;
    for (const resolution of resolutions) {
      if ('thrownError' in resolution || resolution.details.errorCode) {
        return this.collectProviderErrors(resolutions);
      }
      if (resolution.provider === this.fallbackProvider) {
        fallbackResolution = resolution;
      }
      if (typeof value !== 'undefined' && value !== resolution.details.value) {
        mismatch = true;
      } else {
        value = resolution.details.value;
      }
    }

    if (mismatch) {
      this.onMismatch?.(resolutions);
      return {
        details: fallbackResolution!.details,
        provider: fallbackResolution!.provider,
      };
    }

    return this.resolutionToFinalResult(resolutions[0]);
  }
}
