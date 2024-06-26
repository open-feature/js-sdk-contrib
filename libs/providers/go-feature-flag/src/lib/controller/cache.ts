import { GoFeatureFlagProviderOptions } from '../model';
import { EvaluationContext, Logger, ResolutionDetails } from '@openfeature/server-sdk';
import { LRUCache } from 'lru-cache';
import hash from 'object-hash';

export class CacheController {
  // cacheTTL is the time we keep the evaluation in the cache before we consider it as obsolete.
  // If you want to keep the value forever, you can set the FlagCacheTTL field to -1
  private readonly cacheTTL?: number;
  // logger is the Open Feature logger to use
  private logger?: Logger;
  // cache contains the local cache used in the provider to avoid calling the relay-proxy for every evaluation
  private readonly cache?: LRUCache<string, ResolutionDetails<any>>;
  // options for this provider
  private readonly options: GoFeatureFlagProviderOptions;

  constructor(options: GoFeatureFlagProviderOptions, logger?: Logger) {
    this.options = options;
    this.cacheTTL = options.flagCacheTTL !== undefined && options.flagCacheTTL !== 0 ? options.flagCacheTTL : 1000 * 60;
    this.logger = logger;
    const cacheSize =
      options.flagCacheSize !== undefined && options.flagCacheSize !== 0 ? options.flagCacheSize : 10000;
    this.cache = new LRUCache({ maxSize: cacheSize, sizeCalculation: () => 1 });
  }

  get(flagKey: string, evaluationContext: EvaluationContext): ResolutionDetails<any> | undefined {
    if (this.options.disableCache) {
      return undefined;
    }
    const cacheKey = this.buildCacheKey(flagKey, evaluationContext);
    return this.cache?.get(cacheKey);
  }

  set(
    flagKey: string,
    evaluationContext: EvaluationContext,
    evaluationResponse: { resolutionDetails: ResolutionDetails<any>; isCacheable: boolean },
  ) {
    if (this.options.disableCache) {
      return;
    }

    const cacheKey = this.buildCacheKey(flagKey, evaluationContext);
    if (this.cache !== undefined && evaluationResponse.isCacheable) {
      if (this.cacheTTL === -1) {
        this.cache.set(cacheKey, evaluationResponse.resolutionDetails);
      } else {
        this.cache.set(cacheKey, evaluationResponse.resolutionDetails, { ttl: this.cacheTTL });
      }
    }
  }

  clear(): void {
    return this.cache?.clear();
  }

  private buildCacheKey(flagKey: string, evaluationContext: EvaluationContext): string {
    return `${flagKey}-${hash(evaluationContext)}`;
  }
}
