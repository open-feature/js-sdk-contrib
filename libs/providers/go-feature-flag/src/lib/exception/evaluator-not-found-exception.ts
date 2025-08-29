import { GoFeatureFlagException } from './go-feature-flag-exception';

export class EvaluatorNotFoundException extends GoFeatureFlagException {
  constructor(message: string) {
    super(message);
  }
}
