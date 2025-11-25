import { GoFeatureFlagException } from './go-feature-flag-exception';

export class EventPublisherNotFoundException extends GoFeatureFlagException {
  constructor(message: string) {
    super(message);
  }
}
