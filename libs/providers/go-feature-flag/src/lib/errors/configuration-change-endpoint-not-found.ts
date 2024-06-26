import { GoFeatureFlagError } from './goff-error';

export class ConfigurationChangeEndpointNotFound extends GoFeatureFlagError {
  constructor(message?: string, originalError?: Error) {
    super(message, originalError);
  }
}
