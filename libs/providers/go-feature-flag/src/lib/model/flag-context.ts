import type { JsonValue } from '@openfeature/server-sdk';

/**
 * Represents the context of a flag in the GO Feature Flag system.
 * Contains the default SDK value and evaluation context enrichment.
 */
export interface FlagContext {
  /**
   * The default value to return from the SDK if no rule matches.
   */
  defaultSdkValue?: unknown;

  /**
   * Additional context values to enrich the evaluation context.
   */
  evaluationContextEnrichment: Record<string, JsonValue>;
}
