/**
 * FlagConfigRequest represents the request payload for flag configuration.
 */
export interface FlagConfigRequest {
  /**
   * List of flags to retrieve, if not set or empty, we will retrieve all available flags.
   */
  flags?: string[];
}
