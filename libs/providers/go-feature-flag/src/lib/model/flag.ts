import type { FlagBase } from './flag-base';
import type { ScheduledStep } from './scheduled-step';

/**
 * Represents a feature flag for GO Feature Flag.
 */
export interface Flag extends FlagBase {
  /**
   * The list of scheduled rollout steps for this flag.
   */
  scheduledRollout?: ScheduledStep[];
}
