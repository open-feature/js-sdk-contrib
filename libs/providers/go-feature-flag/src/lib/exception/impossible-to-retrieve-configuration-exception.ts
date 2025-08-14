import { GoFeatureFlagException } from './go-feature-flag-exception';

export class ImpossibleToRetrieveConfigurationException extends GoFeatureFlagException {
  constructor(message: string) {
    super(message);
  }
}
