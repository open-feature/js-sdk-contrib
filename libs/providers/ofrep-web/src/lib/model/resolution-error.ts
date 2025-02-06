import { ErrorCode, ResolutionReason } from '@openfeature/web-sdk';

export type ResolutionError = {
  reason: ResolutionReason;
  errorCode: ErrorCode;
  errorDetails?: string;
};

export function isResolutionError(response: unknown): response is ResolutionError {
  if (!response || typeof response !== 'object') {
    return false;
  }

  return 'reason' in response && 'errorCode' in response && !('value' in response);
}
