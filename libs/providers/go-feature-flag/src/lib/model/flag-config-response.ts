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

/**
 * Sentinel returned by the API layer instead of a {@link FlagConfigResponse} when the relay proxy
 * answers `304 Not Modified`.
 *
 * The 304 path must be structurally incapable of carrying a configuration body. Representing it as
 * a response object with empty `flags` makes it indistinguishable from a successful refresh that
 * happened to return nothing, and the caller then overwrites the live configuration with an empty
 * map — silently dropping every flag. A distinct value makes that mistake unrepresentable.
 */
export const NOT_MODIFIED = Symbol('flag-configuration-not-modified');

/**
 * Type of the {@link NOT_MODIFIED} sentinel.
 */
export type NotModified = typeof NOT_MODIFIED;

/**
 * Result of a flag-configuration fetch: either a full configuration, or "nothing changed".
 */
export type FlagConfigurationResult = FlagConfigResponse | NotModified;
