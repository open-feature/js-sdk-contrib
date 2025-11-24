import type { ProgressiveRolloutStep } from './progressive-rollout-step';

/**
 * Represents the progressive rollout of a feature flag.
 */
export interface ProgressiveRollout {
  /**
   * The initial step of the progressive rollout.
   */
  initial: ProgressiveRolloutStep;

  /**
   * The end step of the progressive rollout.
   */
  end: ProgressiveRolloutStep;
}
