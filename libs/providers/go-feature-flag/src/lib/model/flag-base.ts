import type { JsonValue } from '@openfeature/server-sdk';
import type { ExperimentationRollout } from './experimentation-rollout';
import type { Rule } from './rule';

/**
 * Represents the base structure of a feature flag for GO Feature Flag.
 */
export interface FlagBase {
  /**
   * The variations available for this flag.
   */
  variations?: Record<string, JsonValue>;

  /**
   * The list of targeting rules for this flag.
   */
  targeting?: Rule[];

  /**
   * The key used for bucketing users.
   */
  bucketingKey?: string;

  /**
   * The default rule to apply if no targeting rule matches.
   */
  defaultRule: Rule;

  /**
   * The experimentation rollout configuration.
   */
  experimentation?: ExperimentationRollout;

  /**
   * Indicates if events should be tracked for this flag.
   */
  trackEvents?: boolean;

  /**
   * Indicates if the flag is disabled.
   */
  disable?: boolean;

  /**
   * The version of the flag.
   */
  version?: string;

  /**
   * Additional metadata for the flag.
   */
  metadata?: Record<string, JsonValue>;
}
