import { EvaluationContext, FlagValue } from '@openfeature/core';

export interface EvaluationRequest {
  /**
   * Context information for flag evaluation
   */
  context?: EvaluationContext;
}

export enum EvaluationSuccessReason {
  Static = 'STATIC',
  TargetingMatch = 'TARGETING_MATCH',
  Split = 'SPLIT',
  Disabled = 'DISABLED',
  Unknown = 'UNKNOWN',
}

export type EvaluationFlagValue = FlagValue;

export interface EvaluationSuccessResponse {
  /**
   * Feature flag key
   */
  key?: string;
  /**
   * An OpenFeature reason for the evaluation
   */
  reason?: EvaluationSuccessReason;
  /**
   * Variant of the evaluated flag value
   */
  variant?: string;
  /**
   * Arbitrary metadata supporting flag evaluation
   */
  metadata?: object;
  /**
   * Flag evaluation result
   */
  value: EvaluationFlagValue;
}

export function isEvaluationSuccessResponse(response: unknown): response is EvaluationSuccessResponse {
  if (!response || typeof response !== 'object') {
    return false;
  }

  return 'value' in response;
}

export enum EvaluationFailureErrorCode {
  ParseError = 'PARSE_ERROR',
  TargetingKeyMissing = 'TARGETING_KEY_MISSING',
  InvalidContext = 'INVALID_CONTEXT',
  General = 'GENERAL',
}

export interface EvaluationFailureResponse {
  /**
   * Feature flag key
   */
  key: string;
  /**
   * OpenFeature compatible error code. See https://openfeature.dev/specification/types#error-code
   */
  errorCode: EvaluationFailureErrorCode;
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
