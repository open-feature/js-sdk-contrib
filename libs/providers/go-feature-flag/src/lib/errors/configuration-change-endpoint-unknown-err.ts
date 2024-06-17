import { GoFeatureFlagError } from './goff-error';

export class ConfigurationChangeEndpointUnknownErr extends GoFeatureFlagError {
  constructor(message?: string, originalError?: Error) {
    super(message, originalError);
  }
}
