import type { ErrorCode, EvaluationContext, FlagMetadata, FlagValue, ResolutionReason } from '@openfeature/core';

export interface EvaluationRequest {
  /**
   * Context information for flag evaluation
   */
  context?: EvaluationContext;
}

/**
 * The possible values resulting from a flag evaluation.
 * In OFREP, a "disabled" flag is represented by undefined value
 * https://github.com/open-feature/protocol/issues/46
 * https://github.com/open-feature/protocol/pull/49/files
 */
export type EvaluationFlagValue = FlagValue | undefined;

export interface MetadataResponse {
  /**
   * Arbitrary metadata for the flag, useful for telemetry and documentary purposes
   */
  metadata?: FlagMetadata;
}

export interface EvaluationSuccessResponse extends MetadataResponse {
  /**
   * Feature flag key
   */
  key?: string;
  /**
   * An OpenFeature reason for the evaluation
   */
  reason?: ResolutionReason;
  /**
   * Variant of the evaluated flag value
   */
  variant?: string;
  /**
   * Flag evaluation result
   */
  value?: EvaluationFlagValue;
}

export interface EvaluationFailureResponse extends MetadataResponse {
  /**
   * Feature flag key
   */
  key: string;
  /**
   * OpenFeature compatible error code. See https://openfeature.dev/specification/types#error-code
   */
  errorCode: ErrorCode;
  /**
   * An error description for logging or other needs
   */
  errorDetails?: string;
}

export function isEvaluationFailureResponse(response: unknown): response is EvaluationFailureResponse {
  if (!response || typeof response !== 'object') {
    return false;
  }

  return (
    'key' in response &&
    typeof response.key === 'string' &&
    'errorCode' in response &&
    typeof response.errorCode === 'string'
  );
}

export type EvaluationResponse = EvaluationFailureResponse | EvaluationSuccessResponse;
