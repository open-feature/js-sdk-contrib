import { GoFeatureFlagException } from './go-feature-flag-exception';

export class ImpossibleToSendDataToTheCollectorException extends GoFeatureFlagException {
  constructor(message: string) {
    super(message);
  }
}
