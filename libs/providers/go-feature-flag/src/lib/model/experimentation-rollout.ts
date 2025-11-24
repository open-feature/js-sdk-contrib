/**
 * Represents the rollout period of an experimentation.
 */
export interface ExperimentationRollout {
  /**
   * The start date of the experimentation rollout.
   */
  start: Date;

  /**
   * The end date of the experimentation rollout.
   */
  end: Date;
}
