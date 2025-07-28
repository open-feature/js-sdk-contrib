import type { EvaluationContext, TrackingEventDetails } from '@openfeature/server-sdk';

/**
 * TrackingEvent is an interface that represents a tracking event for a feature flag.
 * A tracking event is generated when we call the track method on the client.
 */
export interface TrackingEvent {
  /**
   * Kind is the kind of event.
   */
  kind: 'tracking';

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
   * EvaluationContext contains the evaluation context used for the tracking.
   */
  evaluationContext?: EvaluationContext;

  /**
   * TrackingDetails contains the details of the tracking event.
   */
  trackingEventDetails?: TrackingEventDetails;
}
