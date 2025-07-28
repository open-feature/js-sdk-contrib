import type { JsonValue } from '@openfeature/server-sdk';

/**
 * This interface represents a feature event, used to send evaluation events to the GO Feature Flag server.
 */
export interface FeatureEvent {
  /**
   * Kind is the kind of event.
   */
  kind: 'feature';

  /**
   * Creation date of the event in seconds since epoch.
   */
  creationDate: number;

  /**
   * ContextKind is the kind of context that generated an event.
   */
  contextKind: string;

  /**
   * Feature flag name or key.
   */
  key: string;

  /**
   * User key is the unique identifier for the user or context (the targetingKey).
   */
  userKey: string;

  /**
   * Default is true if the feature is using the default value.
   */
  default: boolean;

  /**
   * Value of the feature flag evaluation result.
   */
  value?: JsonValue;

  /**
   * Variation is the variation of the feature flag that was returned by the evaluation.
   */
  variation: string;

  /**
   * Version is the version of the feature flag that was evaluated.
   * If the feature flag is not versioned, this will be null or empty.
   */
  version?: string;
}
