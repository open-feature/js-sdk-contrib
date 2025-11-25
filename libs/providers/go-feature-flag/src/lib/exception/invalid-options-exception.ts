import { GoFeatureFlagException } from './go-feature-flag-exception';

export class InvalidOptionsException extends GoFeatureFlagException {
  constructor(message: string) {
    super(message);
  }
}
