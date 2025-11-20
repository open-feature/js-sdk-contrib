import { GoFeatureFlagException } from './go-feature-flag-exception';

export class UnauthorizedException extends GoFeatureFlagException {
  constructor(message: string) {
    super(message);
  }
}
