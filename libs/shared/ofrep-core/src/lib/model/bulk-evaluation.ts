import type { ErrorCode } from '@openfeature/core';
import type { EvaluationResponse, MetadataResponse } from './evaluation';

export interface BulkEvaluationFailureResponse extends MetadataResponse {
  /**
   * An appropriate code specific to the bulk evaluation error. See https://openfeature.dev/specification/types#error-code
   */
  errorCode: ErrorCode;
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

export interface BulkEvaluationSuccessResponse extends MetadataResponse {
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
