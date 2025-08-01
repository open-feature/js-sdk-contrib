import type { EvaluationContext, Provider, JsonValue, ResolutionDetails, Logger } from '@openfeature/web-sdk';
import { ErrorCode, ProviderEvents, StandardResolutionReasons } from '@openfeature/web-sdk';
import { EventEmitter } from 'events';

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
 * A helper function to fetch a flag, update the cache, and notify OpenFeature of changes.
 * It's defined within the factory's scope to access the client, cache, emitter, and logger.
 */
const fetchFlagAndUpdateCache = (
  // Parameters required for the fetch operation
  flagKey: string,
  defaultValue: boolean,
  context: EvaluationContext,
  cacheKey: string,
  // State managed by the factory's closure
  client: RocketFlagClient,
  cache: Map<string, ResolutionDetails<boolean>>,
  emitter: EventEmitter,
  logger?: Logger,
) => {
  const userContext: UserContext = {};
  const { targetingKey } = context;

  if (targetingKey && typeof targetingKey === 'string' && targetingKey !== '') {
    userContext.cohort = targetingKey;
  }

  client
    .getFlag(flagKey, userContext)
    .then((flagStatus) => {
      const details: ResolutionDetails<boolean> = {
        value: flagStatus.enabled,
        reason: userContext.cohort ? StandardResolutionReasons.TARGETING_MATCH : StandardResolutionReasons.DEFAULT,
      };
      cache.set(cacheKey, details);
      emitter.emit(ProviderEvents.ConfigurationChanged, { flagsChanged: [flagKey] });
      logger?.debug(`Successfully fetched flag: ${flagKey}`);
    })
    .catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      const details: ResolutionDetails<boolean> = {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: err.message,
      };
      cache.set(cacheKey, details);
      emitter.emit(ProviderEvents.ConfigurationChanged, { flagsChanged: [flagKey] });
      logger?.error(`Error fetching flag: ${flagKey}`, err);
    });
};

/**
 * Creates a functional OpenFeature provider for RocketFlag.
 * This provider resolves boolean flags from the RocketFlag service.
 *
 * @param {RocketFlagClient} client - An instance of the RocketFlag client.
 * @returns {Provider & EventEmitter} A provider instance that can be used with the OpenFeature SDK.
 */
export function createRocketFlagProvider(client: RocketFlagClient): Provider & EventEmitter {
  const emitter = new EventEmitter();
  const cache = new Map<string, ResolutionDetails<boolean>>();
  let logger: Logger | undefined;

  // Define the provider's logic in a plain object.
  const providerLogic = {
    metadata: {
      name: 'RocketFlagProvider',
    },
    runsOn: 'client' as const,
    hooks: [],

    initialize: async (): Promise<void> => {
      logger?.debug('Initialising RocketFlagProvider...');
    },

    resolveBooleanEvaluation: (
      flagKey: string,
      defaultValue: boolean,
      context: EvaluationContext,
      evalLogger: Logger,
    ): ResolutionDetails<boolean> => {
      logger = evalLogger; // Capture the logger for async operations.
      const cacheKey = JSON.stringify({ flagKey, context });

      // Fetch in the background.
      fetchFlagAndUpdateCache(flagKey, defaultValue, context, cacheKey, client, cache, emitter, logger);

      // Immediately return a cached value if available.
      if (cache.has(cacheKey)) {
        // The .get() method can return undefined, so we handle that case.
        return cache.get(cacheKey) as ResolutionDetails<boolean>;
      }

      // Return a STALE value while the fetch is in progress.
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.STALE,
      };
    },

    // The other evaluation methods simply return an error.
    resolveStringEvaluation: (flagKey: string, defaultValue: string): ResolutionDetails<string> => ({
      value: defaultValue,
      reason: StandardResolutionReasons.ERROR,
      errorCode: ErrorCode.TYPE_MISMATCH,
      errorMessage: 'RocketFlag: String flags are not yet supported.',
    }),

    resolveNumberEvaluation: (flagKey: string, defaultValue: number): ResolutionDetails<number> => ({
      value: defaultValue,
      reason: StandardResolutionReasons.ERROR,
      errorCode: ErrorCode.TYPE_MISMATCH,
      errorMessage: 'RocketFlag: Number flags are not yet supported.',
    }),

    resolveObjectEvaluation: <U extends JsonValue>(flagKey: string, defaultValue: U): ResolutionDetails<U> => ({
      value: defaultValue,
      reason: StandardResolutionReasons.ERROR,
      errorCode: ErrorCode.TYPE_MISMATCH,
      errorMessage: 'RocketFlag: Object flags are not yet supported.',
    }),
  };

  // The OpenFeature SDK expects the provider itself to be an event emitter.
  // We merge the EventEmitter instance with our provider logic.
  return Object.assign(emitter, providerLogic);
}
