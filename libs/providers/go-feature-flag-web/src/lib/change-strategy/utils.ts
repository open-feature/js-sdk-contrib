import type { GoFeatureFlagWebProviderOptions } from '../model';
import type { FlagChangeStrategyOptions } from './model';

/**
 * Helper function to build {@link FlagChangeStrategyOptions} options with default values.
 */
export function buildOptionsWithDefaults<T extends FlagChangeStrategyOptions = FlagChangeStrategyOptions>(
  options?: Partial<T>,
): T {
  const res = Object.assign({} as T, options as T);
  res.apiKey ??= '';
  res.endpoint ??= '';
  res.maxAttempts ??= 10;
  res.backoff = {
    maxDelayMs: options?.backoff?.maxDelayMs ?? Number.MAX_SAFE_INTEGER,
    minDelayMs: options?.backoff?.minDelayMs ?? 100,
    multiplier: options?.backoff?.multiplier ?? 2,
  };
  return res;
}

/**
 * Helper function to build {@link FlagChangeStrategyOptions} options with default values,
 * from the provided {@link GoFeatureFlagWebProviderOptions} options.
 * @param options
 * @returns
 */
export function buildOptionsFromProviderOptions<T extends FlagChangeStrategyOptions = FlagChangeStrategyOptions>(
  options?: GoFeatureFlagWebProviderOptions,
) {
  return {
    apiKey: options?.apiKey ?? '',
    backoff: {
      maxDelayMs: Number.MAX_SAFE_INTEGER,
      minDelayMs: options?.retryInitialDelay ?? 100,
      multiplier: options?.retryDelayMultiplier ?? 2,
    },
    endpoint: options?.endpoint ?? '',
    maxAttempts: options?.maxRetries ?? 10,
  } as T;
}
