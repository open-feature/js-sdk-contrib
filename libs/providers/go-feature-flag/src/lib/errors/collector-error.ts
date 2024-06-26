import { GoFeatureFlagError } from './goff-error';

/**
 * An error occurred while calling the GOFF event collector.
 */
export class CollectorError extends GoFeatureFlagError {
  constructor(message?: string, originalError?: Error) {
    super(message, originalError);
  }
}
