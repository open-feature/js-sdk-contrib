import type { ProgressiveRollout } from './progressive-rollout';

/**
 * Represents a rule in the GO Feature Flag system.
 */
export interface Rule {
  /**
   * The name of the rule.
   */
  name?: string;

  /**
   * The query associated with the rule.
   */
  query?: string;

  /**
   * The variation to serve if the rule matches.
   */
  variation?: string;

  /**
   * The percentage mapping for variations.
   */
  percentage?: Record<string, number>;

  /**
   * Indicates if the rule is disabled.
   */
  disable?: boolean;

  /**
   * The progressive rollout configuration for this rule.
   */
  progressiveRollout?: ProgressiveRollout;
}
