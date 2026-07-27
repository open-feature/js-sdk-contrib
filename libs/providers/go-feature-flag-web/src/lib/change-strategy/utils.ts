import type { GoFeatureFlagWebProviderOptions } from '../model';
import type { FlagChangeStrategyOptions } from './model';

export function buildOptionsWithDefaults<T extends FlagChangeStrategyOptions = FlagChangeStrategyOptions>(
  options?: Partial<T>,
) {
  const res = Object.assign({} as T, options as T);
  res.apiKey ??= '';
  res.connectionTimeoutMs ??= 0;
  res.endpoint ??= '';
  res.maxAttempts ??= 10;
  res.backoff = {
    maxDelayMs: options?.backoff?.maxDelayMs ?? Number.MAX_SAFE_INTEGER,
    minDelayMs: options?.backoff?.minDelayMs ?? 100,
    multiplier: options?.backoff?.multiplier ?? 2,
  };
  return res;
}

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
    connectionTimeoutMs: options?.apiTimeout ?? 0,
    endpoint: options?.endpoint ?? '',
    maxAttempts: options?.maxRetries ?? 10,
  } as T;
}
