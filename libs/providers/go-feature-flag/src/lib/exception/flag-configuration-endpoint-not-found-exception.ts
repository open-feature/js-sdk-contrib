import { GoFeatureFlagException } from './go-feature-flag-exception';

export class FlagConfigurationEndpointNotFoundException extends GoFeatureFlagException {
  constructor() {
    super('Flag configuration endpoint not found');
  }
}
