import { EvaluationFailureErrorCode, EvaluationResponse } from './evaluation';

export interface BulkEvaluationFailureResponse {
  /**
   * An appropriate code specific to the bulk evaluation error. See https://openfeature.dev/specification/types#error-code
   */
  errorCode: EvaluationFailureErrorCode;
  /**
   * Optional error details description for logging or other needs
   */
  errorDetails?: string;
}

export function isBulkEvaluationFailureResponse(response: unknown): response is BulkEvaluationFailureResponse {
  if (!response || typeof response !== 'object') {
    return false;
  }

  return 'errorCode' in response;
}

export interface BulkEvaluationSuccessResponse {
  flags?: EvaluationResponse[];
}

export interface BulkEvaluationSuccessResponse {
  flags?: EvaluationResponse[];
}

export type BulkEvaluationNotModifiedResponse = undefined;

export function isBulkEvaluationSuccessResponse(response: unknown): response is BulkEvaluationSuccessResponse {
  if (!response || typeof response !== 'object') {
    return false;
  }

  return 'flags' in response;
}

export type BulkEvaluationResponse =
  | BulkEvaluationFailureResponse
  | BulkEvaluationNotModifiedResponse
  | BulkEvaluationSuccessResponse;
