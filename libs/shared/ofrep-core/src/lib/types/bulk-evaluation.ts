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

export interface BulkEvaluationSuccessResponse {
  flags?: EvaluationResponse[];
}

export type BulkEvaluationResponse = BulkEvaluationFailureResponse | BulkEvaluationSuccessResponse;
