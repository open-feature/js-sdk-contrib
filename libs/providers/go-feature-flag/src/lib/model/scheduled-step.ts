import type { FlagBase } from './flag-base';

/**
 * Represents a scheduled step in the rollout of a feature flag.
 */
export interface ScheduledStep extends FlagBase {
  /**
   * The date of the scheduled step.
   */
  date?: Date;
}
