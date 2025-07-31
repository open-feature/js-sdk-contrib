import type { EvaluationContext, Provider, JsonValue, ResolutionDetails, Logger } from '@openfeature/web-sdk';
import { ErrorCode, ProviderEvents, StandardResolutionReasons } from '@openfeature/web-sdk';
import { EventEmitter } from 'events';

// Interfaces for RocketFlag SDK
export interface UserContext {
  cohort?: string;
}

export interface FlagStatus {
  enabled: boolean;
}

interface RocketFlagClient {
  getFlag(flagKey: string, userContext: UserContext): Promise<FlagStatus>;
}

/**
 * The RocketFlagProvider implements the OpenFeature Provider interface
 * to resolve feature flags from the RocketFlag service.
 */
export class RocketFlagProvider extends EventEmitter implements Provider {
  metadata = {
    name: RocketFlagProvider.name,
  };

  readonly runsOn = 'client';
  hooks = [];
  private client: RocketFlagClient;
  private cache: Map<string, ResolutionDetails<boolean>> = new Map();
  private logger?: Logger;

  constructor(client: RocketFlagClient) {
    super();
    this.client = client;
  }

  /**
   * Initialises the provider and can be used to pre-fetch flags.
   */
  async initialize(): Promise<void> {
    this.logger?.debug('Initialising RocketFlagProvider...');
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger: Logger,
  ): ResolutionDetails<boolean> {
    this.logger = logger;
    const cacheKey = JSON.stringify({ flagKey, context });

    // The SDK expects a synchronous return, so we fetch in the background and notify OpenFeature when the value is ready.
    this.fetchFlagAndUpdateCache(flagKey, defaultValue, context, cacheKey);

    // Immediately return a value from the cache if available.
    if (this.cache.has(cacheKey)) {
      const invalidCacheContent: ResolutionDetails<boolean> = {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: 'Invalid content in cache',
      };

      // Since the .get method can return undefined, we handle that with a default "invalid cache" value.
      return this.cache.get(cacheKey) || invalidCacheContent;
    }

    // Return the default value immediately. The cache will be updated later.
    return {
      value: defaultValue,
      reason: StandardResolutionReasons.STALE,
    };
  }

  private fetchFlagAndUpdateCache(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    cacheKey: string,
  ) {
    const userContext: UserContext = {};
    const targetingKey = context.targetingKey;

    if (targetingKey && typeof targetingKey === 'string' && targetingKey !== '') {
      userContext.cohort = targetingKey;
    }

    this.client
      .getFlag(flagKey, userContext)
      .then((flagStatus) => {
        const details: ResolutionDetails<boolean> = {
          value: flagStatus.enabled,
          reason: userContext.cohort ? StandardResolutionReasons.TARGETING_MATCH : StandardResolutionReasons.DEFAULT,
        };
        this.cache.set(cacheKey, details);
        this.emit(ProviderEvents.ConfigurationChanged, { flagsChanged: [flagKey] });
        this.logger?.debug(`Successfully fetched flag: ${flagKey}`);
      })
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        const details: ResolutionDetails<boolean> = {
          value: defaultValue,
          reason: StandardResolutionReasons.ERROR,
          errorCode: ErrorCode.GENERAL,
          errorMessage: err.message,
        };
        this.cache.set(cacheKey, details);
        this.emit(ProviderEvents.ConfigurationChanged, { flagsChanged: [flagKey] });
        this.logger?.error(`Error fetching flag: ${flagKey}`, err);
      });
  }

  resolveStringEvaluation(flagKey: string, defaultValue: string): ResolutionDetails<string> {
    return {
      value: defaultValue,
      reason: StandardResolutionReasons.ERROR,
      errorCode: ErrorCode.TYPE_MISMATCH,
      errorMessage: 'RocketFlag: String flags are not yet supported.',
    };
  }

  resolveNumberEvaluation(flagKey: string, defaultValue: number): ResolutionDetails<number> {
    return {
      value: defaultValue,
      reason: StandardResolutionReasons.ERROR,
      errorCode: ErrorCode.TYPE_MISMATCH,
      errorMessage: 'RocketFlag: Number flags are not yet supported.',
    };
  }

  resolveObjectEvaluation<U extends JsonValue>(flagKey: string, defaultValue: U): ResolutionDetails<U> {
    return {
      value: defaultValue,
      reason: StandardResolutionReasons.ERROR,
      errorCode: ErrorCode.TYPE_MISMATCH,
      errorMessage: 'RocketFlag: Object flags are not yet supported.',
    };
  }
}
