/**
 * Represents a step in the progressive rollout of a feature flag.
 */
export interface ProgressiveRolloutStep {
  /**
   * The variation to be served at this rollout step.
   */
  variation?: string;

  /**
   * The percentage of users to receive this variation at this step.
   */
  percentage?: number;

  /**
   * The date when this rollout step becomes active.
   */
  date: Date;
}
