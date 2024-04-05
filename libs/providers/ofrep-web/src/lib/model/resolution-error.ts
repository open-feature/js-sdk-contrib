import { ResolutionReason } from '@openfeature/web-sdk';
import { EvaluationFailureErrorCode } from '@openfeature/ofrep-core';

export type ResolutionError = {
  reason: ResolutionReason;
  errorCode: EvaluationFailureErrorCode;
  errorDetails?: string;
};

export function isResolutionError(response: unknown): response is ResolutionError {
  if (!response || typeof response !== 'object') {
    return false;
  }

  return 'reason' in response && 'errorCode' in response && !('value' in response);
}
