import type { JsonValue } from '@openfeature/server-sdk';
import type { Flag } from './flag';

/**
 * FlagConfigResponse is a class that represents the response of the flag configuration.
 */
export interface FlagConfigResponse {
  /**
   * Flags is a dictionary that contains the flag key and its corresponding Flag object.
   */
  flags: Record<string, Flag>;

  /**
   * EvaluationContextEnrichment is a dictionary that contains additional context for the evaluation of flags.
   */
  evaluationContextEnrichment: Record<string, JsonValue>;

  /**
   * Etag is a string that represents the entity tag of the flag configuration response.
   */
  etag?: string;

  /**
   * LastUpdated is a nullable DateTime that represents the last time the flag configuration was updated.
   */
  lastUpdated?: Date;
}
